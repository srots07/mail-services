// Database integrity check: no duplicate campaign sends, counters consistent with recipient rows.
// Usage: node --env-file=.env scripts/db-check.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let problems = 0;

const dupes = await client.query(`
  SELECT campaign_contact_id, COUNT(*)::int AS n FROM email_sends
  WHERE kind = 'CAMPAIGN' AND status = 'SENT'
  GROUP BY campaign_contact_id HAVING COUNT(*) > 1`);
console.log(`Duplicate SENT campaign emails: ${dupes.rowCount}`);
problems += dupes.rowCount;

const counters = await client.query(`
  SELECT c.id, c.campaign_name, c.sent_count, c.total_contacts,
         COUNT(cc.id)::int AS actual_total,
         COUNT(cc.id) FILTER (WHERE cc.status = 'SENT')::int AS actual_sent
  FROM campaigns c LEFT JOIN campaign_contacts cc ON cc.campaign_id = c.id
  GROUP BY c.id`);
for (const r of counters.rows) {
  if (r.sent_count !== r.actual_sent || r.total_contacts !== r.actual_total) {
    problems++;
    console.log(`Counter mismatch in "${r.campaign_name}": sent ${r.sent_count}/${r.actual_sent}, total ${r.total_contacts}/${r.actual_total}`);
  }
}
console.log(`Campaigns checked: ${counters.rowCount}`);

const sentWithoutRow = await client.query(`
  SELECT cc.id FROM campaign_contacts cc
  WHERE cc.status = 'SENT' AND NOT EXISTS (
    SELECT 1 FROM email_sends s WHERE s.campaign_contact_id = cc.id AND s.kind = 'CAMPAIGN' AND s.status = 'SENT')`);
console.log(`Recipients marked SENT without a send record: ${sentWithoutRow.rowCount}`);
problems += sentWithoutRow.rowCount;

const scheduledWithoutTime = await client.query(`SELECT id FROM campaign_contacts WHERE status = 'SCHEDULED' AND scheduled_at IS NULL`);
console.log(`Recipients SCHEDULED without a scheduled time: ${scheduledWithoutTime.rowCount}`);
problems += scheduledWithoutTime.rowCount;

const wrongRecipient = await client.query(`
  SELECT s.id FROM email_sends s
  JOIN campaign_contacts cc ON cc.id = s.campaign_contact_id
  JOIN contacts ct ON ct.id = cc.contact_id
  LEFT JOIN generated_emails g ON g.id = s.generated_email_id
  WHERE s.kind = 'CAMPAIGN' AND (lower(s.to_email) <> lower(ct.email) OR (g.id IS NOT NULL AND g.campaign_contact_id <> cc.id))`);
console.log(`Campaign sends addressed to a different row or using another row's email: ${wrongRecipient.rowCount}`);
problems += wrongRecipient.rowCount;

await client.end();
console.log(problems ? `\n${problems} problem(s) found` : "\nAll integrity checks passed");
process.exit(problems ? 1 : 0);
