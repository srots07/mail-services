// End-to-end API check of the single send flow against a running dev server:
// contacts file -> mail body -> sender & CC -> AI generate -> review -> send -> results.
// The test user selects the mock AI and mock email providers, so no real email is sent and no OpenRouter credits are used.
// Usage: node scripts/e2e.mjs [baseUrl]
const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith("http")) ?? "http://localhost:3000";

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  const jar = new Map();
  async function call(path, { method, body, csrf = true, origin = BASE } = {}) {
    const m = method ?? (body === undefined ? "GET" : "POST");
    const headers = { Origin: origin };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    if (csrf && m !== "GET" && jar.has("ecm_csrf")) headers["X-CSRF-Token"] = decodeURIComponent(jar.get("ecm_csrf"));
    const res = await fetch(BASE + path, { method: m, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {}
    return { status: res.status, data, headers: res.headers };
  }
  return { call, jar };
}

async function waitFor(fn, label, timeoutMs = 120_000, everyMs = 1500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await sleep(everyMs);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

function isRedirectTo(r, url) {
  return (
    (r.status >= 300 && r.status < 400 && (r.headers.get("location") ?? "").includes(url)) ||
    (r.status === 200 && typeof r.data === "string" && r.data.includes(`NEXT_REDIRECT;replace;${url}`))
  );
}

const HEADERS = ["company_name", "to_name", "from_name", "email", "city"];
const ROWS = [
  { company_name: "Helix Semiconductors", to_name: "Meera Iyer", from_name: "Anita Desai", email: " Meera@Helix-Semi.example ", city: "Bengaluru" },
  { company_name: "Orion Test Labs", to_name: "Tom Becker", from_name: "", email: "tom@orion-labs.example", city: "Munich" },
  { company_name: "Acme Validation Systems", to_name: "Ganesh Rao", from_name: "", email: "ganesh@acme-validation.example", city: "" },
  { company_name: "QuietCo Labs", to_name: "Lena Park", from_name: "", email: "lena@quietco.example", city: "" },
  { company_name: "Dead Box", to_name: "Bob Stone", from_name: "", email: "bounce@deadbox.example.com", city: "" },
  { company_name: "mock-ai-fail Industries", to_name: "Ravi Kumar", from_name: "", email: "ravi@aiflaky.example", city: "" },
  { company_name: "Nameless Inc", to_name: "", from_name: "", email: "x@nameless.example", city: "" },
  { company_name: "Dup Co", to_name: "Dup Person", from_name: "", email: "TOM@orion-labs.example", city: "" },
  { company_name: "Bad Co", to_name: "Bad Mail", from_name: "", email: "not-an-email", city: "" },
  { company_name: "No Mail Co", to_name: "Nora", from_name: "", email: "", city: "" },
];
const BODY = "Hi [To Name],\n\nWe help teams like [Company Name] cut SLT time.\n\n- AI-driven ATE pattern optimisation\n- SLT yield analytics\n\nBest regards,";
const SUBJECT = "Exploring AI ATE & SLT Opportunities with [Company Name]";
const CC = ["manager@vertex.example", "sales@vertex.example"];
const CONFIRM = "APPROVE & SEND ALL";

async function main() {
  const stamp = Date.now();
  const a = client();
  const b = client();

  console.log("1. Auth");
  let r = await a.call("/api/auth/register", { body: { name: "Tester", email: `tester${stamp}@example.com`, password: "correct-horse-battery" } });
  check("register succeeds", r.status === 200, r.data);
  check("session + csrf cookies set", a.jar.has("ecm_session") && a.jar.has("ecm_csrf"));
  r = await b.call("/api/auth/register", { body: { name: "Other", email: `other${stamp}@example.com`, password: "correct-horse-battery" } });
  check("second user registers", r.status === 200, r.data);
  r = await a.call("/api/auth/login", { body: { email: `tester${stamp}@example.com`, password: "wrong-password!!" } });
  check("wrong password rejected", r.status === 401 || r.status === 400, r);
  r = await client().call("/api/campaigns");
  check("unauthenticated API blocked (401)", r.status === 401, r.status);

  console.log("2. Settings: mock providers, mock mailbox, sender details");
  r = await a.call("/api/settings/providers", { method: "PUT", body: { ai: "mock", email: "mock" } });
  check("select Mock AI + Mock email", r.status === 200 && r.data.ai === "mock" && r.data.email === "mock", r.data);
  r = await a.call("/api/email-account/mock", { body: {} });
  check("mock mailbox connected", r.status === 200, r.data);
  r = await a.call("/api/settings/providers/status");
  check("status: MOCK mode, email connected, no secrets", r.data.mode === "MOCK" && r.data.email.connected === true && !/sk-or-|ya29\.|Bearer /.test(JSON.stringify(r.data)), r.data);
  r = await a.call("/api/sender-profiles", { body: { senderName: "Subhash Rao", designation: "Director, Test Solutions", companyName: "Vertex Labs", phone: "+91 90000 11111", website: "https://vertex.example" } });
  check("sender profile saved as default, email defaults to the mailbox", r.status === 200 && r.data.isDefault === true && String(r.data.email).includes("@"), r.data);
  const senderEmail = r.data.email;
  r = await a.call("/api/sender-profiles", { body: { senderName: " " } });
  check("sender profile requires a name", r.status === 400, r.status);
  r = await b.call("/api/sender-profiles");
  check("sender profiles are per user", r.status === 200 && r.data.profiles.length === 0, r.data);
  const signature = (fromName) => [fromName, "Director, Test Solutions", "Vertex Labs", `+91 90000 11111 | ${senderEmail}`, "https://vertex.example"].join("\n");

  console.log("3. Step 1: contacts file (company name, to name, from name, email)");
  r = await a.call("/api/bulk/import/check", { body: { headers: HEADERS, rows: ROWS } });
  const sum = r.data.summary ?? {};
  check("columns auto-mapped", r.status === 200 && r.data.mapping.company_name === "company_name" && r.data.mapping.to_name === "to_name" && r.data.mapping.from_name === "from_name" && r.data.mapping.email === "email", r.data.mapping);
  check("validation report: 6 valid, 4 invalid, 1 duplicate email", sum.valid === 6 && sum.invalid === 4 && sum.duplicateEmails === 1, sum);
  r = await a.call("/api/bulk/import/check", { body: { headers: ["Company", "Mail ID"], rows: [{ Company: "x", "Mail ID": "a@b.example" }] } });
  check("missing To name column reported", r.status === 200 && r.data.missingColumns.includes("to_name") && !r.data.missingColumns.includes("email"), r.data);
  r = await a.call("/api/bulk/import", { body: { headers: HEADERS, rows: ROWS, campaignName: `E2E ${stamp}`, fileName: "contacts.xlsx" } });
  check("campaign created from the 6 valid rows", r.status === 201 && r.data.imported === 6 && r.data.skipped === 4, r.data);
  const id = r.data.campaignId;
  const rowsOf = async (cid = id, filter = "all") => (await a.call(`/api/campaigns/${cid}/bulk/rows?filter=${filter}&pageSize=200`)).data.items ?? [];
  const overview = async (cid = id) => (await a.call(`/api/campaigns/${cid}/bulk`)).data;
  let rows = await rowsOf();
  const row = (name) => rows.find((x) => x.customerName === name);
  check("rows keep file order; email trimmed + lowercased", rows.map((x) => x.number).join() === "1,2,3,4,5,6" && row("Meera Iyer")?.to === "meera@helix-semi.example", rows.map((x) => [x.customerName, x.to]));
  check("from name and extra columns stored", row("Meera Iyer")?.fromName === "Anita Desai" && row("Meera Iyer")?.extra?.city === "Bengaluru" && row("Tom Becker")?.fromName === "", row("Meera Iyer"));
  let o = await overview();
  check("default sender preselected, CC empty, nothing generated", Boolean(o.campaign.senderProfileId) && o.campaign.ccEmails.length === 0 && o.counts.total === 6 && o.counts.generated === 0, o.campaign);

  console.log("4. Security");
  r = await a.call(`/api/campaigns/${id}/bulk`, { method: "PUT", body: { bulkBody: "x" }, csrf: false });
  check("mutation without CSRF token rejected (403)", r.status === 403, r.status);
  r = await a.call(`/api/campaigns/${id}/bulk`, { method: "PUT", body: { bulkBody: "x" }, origin: "https://evil.example.com" });
  check("cross-origin mutation rejected (403)", r.status === 403, r.status);
  r = await b.call(`/api/campaigns/${id}/bulk`);
  check("other user cannot open the campaign (404)", r.status === 404, r.status);
  r = await b.call(`/api/campaigns/${id}/bulk/send`, { body: { confirmText: CONFIRM } });
  check("other user cannot send (404)", r.status === 404, r.status);

  console.log("5. Step 2: mail body + subject");
  r = await a.call(`/api/campaigns/${id}/bulk/generate`, { body: { mode: "all" } });
  check("generate refused before the mail body is added", r.status === 400, r.data);
  r = await a.call(`/api/campaigns/${id}/bulk`, { method: "PUT", body: { bulkBody: BODY, subjectMode: "FIXED", subjectTemplate: SUBJECT } });
  check("mail body + fixed subject saved", r.status === 200 && r.data.campaign.bulkBody === BODY, r.data);

  console.log("6. Step 3: sender details + CC");
  r = await a.call(`/api/campaigns/${id}/bulk`, { method: "PUT", body: { ccEmails: ["not-an-email"] } });
  check("invalid CC address refused", r.status === 400, r.status);
  r = await a.call(`/api/campaigns/${id}/bulk`, { method: "PUT", body: { ccEmails: Array.from({ length: 11 }, (_, i) => `cc${i}@vertex.example`) } });
  check("more than 10 CC addresses refused", r.status === 400, r.status);
  r = await a.call(`/api/campaigns/${id}/bulk`, { method: "PUT", body: { ccEmails: [" Manager@Vertex.example ", ...CC] } });
  check("CC list saved (trimmed, lowercased, de-duplicated)", r.status === 200 && JSON.stringify(r.data.campaign.ccEmails) === JSON.stringify(CC), r.data.campaign?.ccEmails);

  console.log("7. Step 4: AI generate");
  r = await a.call(`/api/campaigns/${id}/bulk/generate`, { body: { mode: "all" } });
  check("6 emails queued for AI", r.status === 200 && r.data.queued === 6, r.data);
  o = await waitFor(async () => {
    const x = await overview();
    return x.counts.queued === 0 && x.counts.generated === 6 ? x : null;
  }, "AI generation", 240_000, 2000);
  check("all 6 generated, none blocked, campaign ready for review", o.counts.blocked === 0 && o.campaign.status === "READY_FOR_REVIEW", { counts: o.counts, status: o.campaign.status });
  rows = await rowsOf();
  const expected = (name, company, fromName) => `${BODY.replace("[To Name]", name).replace("[Company Name]", company)}\n${signature(fromName)}`;
  check("body keeps the mail format; signature uses the row's from name", row("Meera Iyer")?.email?.body === expected("Meera Iyer", "Helix Semiconductors", "Anita Desai"), row("Meera Iyer")?.email?.body);
  check("signature falls back to the sender name when from name is empty", row("Tom Becker")?.email?.body === expected("Tom Becker", "Orion Test Labs", "Subhash Rao"), row("Tom Becker")?.email?.body);
  check("fixed subject per company", row("Tom Becker")?.email?.subject === "Exploring AI ATE & SLT Opportunities with Orion Test Labs", row("Tom Becker")?.email?.subject);
  check(
    "no email mentions another row's contact or company",
    rows.every((x) => rows.every((y) => y.id === x.id || (!x.email.body.includes(y.customerName) && !`${x.email.subject}\n${x.email.body}`.includes(y.companyName)))),
    rows.map((x) => x.email.subject),
  );
  check("AI used for normal rows", row("Meera Iyer")?.aiUsed === true, row("Meera Iyer"));
  check("AI failure keeps the mail body text (no blocking problem)", row("Ravi Kumar")?.aiUsed === false && row("Ravi Kumar")?.email?.body === expected("Ravi Kumar", "mock-ai-fail Industries", "Subhash Rao") && !row("Ravi Kumar")?.problem, row("Ravi Kumar"));
  r = await a.call(`/api/campaigns/${id}/logs?type=ai`);
  const meeraLog = (r.data.items ?? []).find((l) => l.status === "SUCCESS" && l.recipient === "meera@helix-semi.example");
  check(
    "AI prompt has this contact's details (incl. extra columns) and no other contact",
    !!meeraLog && meeraLog.prompt.includes("<contact_details>") && meeraLog.prompt.includes("Bengaluru") && meeraLog.prompt.includes("Anita Desai") && !meeraLog.prompt.includes("Orion Test Labs"),
    meeraLog?.prompt?.slice(0, 400),
  );
  check("AI logs contain no API key", !JSON.stringify(r.data).match(/sk-or-|Bearer /));
  r = await a.call(`/api/campaigns/${id}/logs?type=sends`);
  check("generation sent and scheduled nothing", (r.data.items ?? []).length === 0 && rows.every((x) => x.status === "READY" && !x.scheduledAt), r.data.items);

  console.log("8. Step 5: review");
  const tom = row("Tom Becker");
  r = await a.call(`/api/campaigns/${id}/recipients/${tom.id}`, { method: "PATCH", body: { subject: "bad\r\nBcc: x@y.example", body: "x" } });
  check("header injection in subject rejected", r.status === 400, r.status);
  r = await a.call(`/api/campaigns/${id}/recipients/${tom.id}`, { method: "PATCH", body: { subject: "Hello [Company Name]", body: tom.email.body } });
  check("edit saved", r.status === 200, r.data);
  r = await a.call(`/api/campaigns/${id}/recipients/approve`, { body: { ids: [tom.id] } });
  check("email with an unreplaced placeholder cannot be approved", r.status === 200 && r.data.approved === 0, r.data);
  r = await a.call(`/api/campaigns/${id}/bulk/generate`, { body: { mode: "selected", ids: [tom.id] } });
  check("regenerate queued", r.status === 200 && r.data.queued === 1, r.data);
  await waitFor(async () => ((await overview()).counts.queued === 0 ? true : null), "regeneration", 60_000, 1000);
  rows = await rowsOf();
  check("regenerated email is clean again", row("Tom Becker")?.email?.subject === "Exploring AI ATE & SLT Opportunities with Orion Test Labs" && !row("Tom Becker")?.problem, row("Tom Becker"));

  const ganesh = row("Ganesh Rao");
  r = await a.call(`/api/campaigns/${id}/bulk/rows/${ganesh.id}/email`, { method: "PUT", body: { email: "tom@orion-labs.example" } });
  check("an address already used by another row is refused", r.status === 409, r.data);
  r = await a.call(`/api/campaigns/${id}/bulk/rows/${ganesh.id}/email`, { method: "PUT", body: { email: "bad" } });
  check("an invalid address is refused", r.status === 400, r.status);
  r = await a.call(`/api/campaigns/${id}/bulk/rows/${ganesh.id}/email`, { method: "PUT", body: { email: "Ganesh.Rao@Acme-Validation.example" } });
  check("corrected address saved", r.status === 200, r.data);
  r = await a.call(`/api/campaigns/${id}/recipients/approve`, { body: { all: true } });
  check("Approve all approves the 6 clean emails", r.status === 200 && r.data.approved === 6, r.data);
  r = await a.call(`/api/campaigns/${id}/recipients/reject`, { body: { ids: [row("Lena Park").id] } });
  check("reject one email", r.status === 200 && r.data.rejected === 1, r.data);

  r = await a.call(`/api/campaigns/${id}/test-email`, { body: { campaignContactId: tom.id, to: "me@example.com" } });
  check("test email sent", r.status === 200 && r.data.status === "SENT", r.data);
  r = await a.call(`/api/campaigns/${id}/logs?type=sends`);
  const tests = (r.data.items ?? []).filter((x) => x.kind === "TEST");
  check("test email goes only to the test address (no CC) and is not a campaign send", tests.length === 1 && tests[0].toEmail === "me@example.com" && tests[0].ccEmails.length === 0 && !(r.data.items ?? []).some((x) => x.kind === "CAMPAIGN"), r.data.items);

  console.log("9. Step 6: send (each contact separately, CC on every email)");
  r = await a.call(`/api/campaigns/${id}/bulk/send`);
  check("summary: 5 to send, 1 rejected, CC listed", r.status === 200 && r.data.counts.willSend === 5 && r.data.counts.rejected === 1 && JSON.stringify(r.data.cc) === JSON.stringify(CC) && r.data.confirmText === CONFIRM, r.data);
  r = await a.call(`/api/campaigns/${id}/bulk/send`, { body: { confirmText: "approve & send all" } });
  check("wrong confirmation text refused", r.status === 400, r.data);
  r = await a.call(`/api/campaigns/${id}/bulk/send`, { body: { confirmText: CONFIRM, startMode: "at", date: "2026-01-01", time: "10:00", timezone: "Asia/Kolkata" } });
  check("schedule in the past refused", r.status === 400, r.data);
  r = await a.call(`/api/campaigns/${id}/logs?type=sends`);
  check("refused attempts sent nothing", !(r.data.items ?? []).some((x) => x.kind === "CAMPAIGN"), r.data.items);
  r = await a.call(`/api/campaigns/${id}/bulk/send`, { body: { confirmText: CONFIRM, startMode: "now", intervalSeconds: 1 } });
  check(`"${CONFIRM}" schedules the 5 emails`, r.status === 200 && r.data.scheduled === 5, r.data);
  await waitFor(async () => {
    const x = await rowsOf();
    return x.filter((y) => ["SENT", "FAILED"].includes(y.status)).length === 5 ? x : null;
  }, "emails sent", 90_000);
  r = await a.call(`/api/campaigns/${id}/logs?type=sends`);
  const sends = (r.data.items ?? []).filter((x) => x.kind === "CAMPAIGN" && x.status === "SENT");
  const sentTo = sends.map((x) => x.toEmail).sort();
  check(
    "one email per contact, to the file / corrected addresses",
    JSON.stringify(sentTo) === JSON.stringify(["ganesh.rao@acme-validation.example", "meera@helix-semi.example", "ravi@aiflaky.example", "tom@orion-labs.example"]),
    sentTo,
  );
  check("every email copied the CC list", sends.every((x) => JSON.stringify(x.ccEmails) === JSON.stringify(CC)), sends.map((x) => x.ccEmails));
  check("rejected email never sent", !(r.data.items ?? []).some((x) => x.toEmail === "lena@quietco.example"), r.data.items);
  rows = await rowsOf();
  check("bounced address recorded as FAILED with an error", row("Bob Stone").displayStatus === "FAILED" && Boolean(row("Bob Stone").errorMessage), row("Bob Stone"));
  r = await a.call(`/api/campaigns/${id}/bulk/send`, { body: { confirmText: CONFIRM, startMode: "now", intervalSeconds: 1 } });
  check("second send refused (no duplicate sends)", r.status === 409, r.data);

  console.log("10. Step 7: results + export");
  o = await overview();
  check("results: 4 sent, 1 failed, 1 rejected", o.counts.sent === 4 && o.counts.failed === 1 && o.counts.rejected === 1, o.counts);
  r = await a.call(`/api/campaigns/${id}/export`);
  const csv = typeof r.data === "string" ? r.data : "";
  check(
    "export has company, to name, from name, email, CC and status",
    r.status === 200 && csv.includes("company_name,to_name,from_name,email,cc,subject,body,status,sent_at,error") && csv.includes("Anita Desai") && csv.includes(CC.join("; ")) && csv.includes("REJECTED") && csv.includes("FAILED"),
    csv.slice(0, 300),
  );
  r = await a.call(`/api/campaigns/${id}/logs?type=activity&limit=500`);
  const cats = new Set((r.data.items ?? []).map((l) => l.category));
  check("activity log covers import, AI, sending and state", ["CSV_IMPORT", "AI_GENERATION", "EMAIL_SEND", "CAMPAIGN_STATE"].every((c) => cats.has(c)), [...cats]);
  check("logs contain no secrets", !/sk-or-|ya29\.|Bearer |refresh_token/.test(JSON.stringify(r.data)));

  console.log("11. Scheduling in a time zone + large-campaign count confirmation");
  const one = [{ company_name: "Kappa Devices", to_name: "Ivy Chen", from_name: "", email: `ivy${stamp}@kappa.example`, city: "" }];
  r = await a.call("/api/bulk/import", { body: { headers: HEADERS, rows: one, campaignName: `TZ ${stamp}` } });
  const tzId = r.data.campaignId;
  await a.call(`/api/campaigns/${tzId}/bulk`, { method: "PUT", body: { bulkBody: BODY, subjectMode: "FIXED", subjectTemplate: "Hello [Company Name]" } });
  await a.call(`/api/campaigns/${tzId}/bulk/generate`, { body: { mode: "all" } });
  await waitFor(async () => ((await overview(tzId)).counts.generated === 1 ? true : null), "tz generation", 60_000, 1000);
  const tzDate = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  r = await a.call(`/api/campaigns/${tzId}/bulk/send`, { body: { confirmText: CONFIRM, startMode: "at", date: tzDate, time: "10:00", timezone: "Asia/Kolkata" } });
  check("scheduled at 10:00 Asia/Kolkata = 04:30 UTC", r.status === 200 && r.data.scheduled === 1 && r.data.firstAt === `${tzDate}T04:30:00.000Z`, r.data);
  r = await a.call(`/api/campaigns/${tzId}/send/cancel`, { body: {} });
  r = await a.call(`/api/campaigns/${tzId}/logs?type=sends`);
  check("scheduled campaign cancelled before sending anything", (r.data.items ?? []).length === 0, r.data.items);

  const many = Array.from({ length: 30 }, (_, i) => ({ company_name: `Company ${i + 1}`, to_name: `Person ${i + 1}`, from_name: "", email: `p${i + 1}.${stamp}@count.example`, city: "" }));
  r = await a.call("/api/bulk/import", { body: { headers: HEADERS, rows: many, campaignName: `Count ${stamp}` } });
  const countId = r.data.campaignId;
  await a.call(`/api/campaigns/${countId}/bulk`, { method: "PUT", body: { bulkBody: BODY, subjectMode: "FIXED", subjectTemplate: "Hello [Company Name]" } });
  await a.call(`/api/campaigns/${countId}/bulk/generate`, { body: { mode: "all" } });
  await waitFor(async () => ((await overview(countId)).counts.generated === 30 ? true : null), "30 generated", 180_000, 2000);
  r = await a.call(`/api/campaigns/${countId}/bulk/send`);
  check("large campaign asks for the count", r.data.requireCount === true && r.data.counts.willSend === 30, r.data);
  r = await a.call(`/api/campaigns/${countId}/bulk/send`, { body: { confirmText: CONFIRM, expectedCount: 29 } });
  check("wrong count refused", r.status === 400, r.data);
  o = await overview(countId);
  check("refused large send approved and scheduled nothing", o.counts.approved === 0 && o.counts.scheduled === 0, o.counts);

  console.log("12. Saved mail bodies, pages and removed features");
  r = await a.call("/api/campaign-templates", { body: { name: "ATE outreach", body: BODY, subjectMode: "FIXED", subjectTemplate: SUBJECT, ccEmails: CC } });
  check("mail body template saved with its CC list", r.status === 200 && r.data.name === "ATE outreach" && JSON.stringify(r.data.ccEmails) === JSON.stringify(CC), r.data);
  r = await a.call("/api/campaign-templates", { body: { name: "No subject", body: BODY, subjectMode: "FIXED" } });
  check("fixed-subject template needs a subject", r.status === 400, r.status);
  r = await b.call("/api/campaign-templates");
  check("templates are per user", r.status === 200 && r.data.templates.length === 0, r.data);
  for (const p of ["/campaigns", "/campaigns/new", `/campaigns/${id}/bulk/contacts`, `/campaigns/${id}/bulk/template`, `/campaigns/${id}/bulk/sender`, `/campaigns/${id}/bulk/generate`, `/campaigns/${id}/bulk/review`, `/campaigns/${id}/bulk/send`, `/campaigns/${id}/bulk/results`, "/settings"]) {
    r = await a.call(p);
    check(`${p.replace(id, ":id")} renders`, r.status === 200, r.status);
  }
  r = await a.call(`/campaigns/${id}`);
  check("campaign link opens the results step", isRedirectTo(r, `/campaigns/${id}/bulk/results`), [r.status, r.headers.get("location")]);
  r = await a.call("/dashboard");
  check("/dashboard renders", r.status === 200, [r.status, r.headers.get("location")]);
  for (const p of ["/research", "/companies", "/contacts"]) {
    r = await a.call(p);
    check(`${p} page removed (404)`, r.status === 404, r.status);
  }
  for (const p of ["/api/research/progress", "/api/companies", "/api/contacts"]) {
    r = await a.call(p);
    check(`${p} API removed (404)`, r.status === 404, r.status);
  }
  r = await a.call(`/api/campaigns/${id}/approve-and-send`, { body: { confirm: true } });
  check("old one-click send API removed (404)", r.status === 404, r.status);

  console.log("13. Logout");
  r = await a.call("/api/auth/logout", { body: {} });
  check("logout ok", r.status === 200, r.data);
  r = await a.call("/api/campaigns");
  check("session invalid after logout", r.status === 401, r.status);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  console.log(`\n${passed} passed, ${failed} failed (aborted)`);
  process.exit(1);
});
