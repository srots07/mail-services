// Live OpenRouter personalization check (uses a few OpenRouter credits; never sends email).
// Registers a throwaway user, selects AI = OpenRouter and Email = Mock, imports 7 distinct recipients,
// generates, and verifies each email names only its own recipient/company.
// Usage: node scripts/openrouter-live.mjs [baseUrl]
// With --body every row carries a ready-written body; checks that the AI only lightly adapts it.
const BASE = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const BODY_MODE = process.argv.includes("--body");
const WRITTEN_BODY =
  "Hi Rahul,\n\nI came across your team's recent work and wanted to share a short introduction. We help companies cut manual reporting time with simple automation, and I think it could be useful for you.\n\nWould you be open to a 15-minute call next week?\n\nRegards,\nSam";

const BASE_PEOPLE = [
  { email: "priya.shah@acme-robotics.example.com", company_name: "Acme Robotics", to_person_name: "Priya Shah", from_person_name: "Jordan Lee", purpose_reason: "Partnership on warehouse automation", tone: "formal", key_points: "Pilot in Q3; 20% faster picking", context: "Met at ProMat 2026 in Chicago", subject_context: "Warehouse pilot", additional_details: "Mention our Chicago office" },
  { email: "liam@brightpath.example.com", company_name: "BrightPath Learning", to_person_name: "Liam Walsh", from_person_name: "Jordan Lee", purpose_reason: "Offer tutoring analytics", tone: "friendly", key_points: "Dashboard; parent reports", context: "Read their blog on student retention", subject_context: "Student retention", additional_details: "Free 30-day trial" },
  { email: "sofia@verdefarms.example.com", company_name: "Verde Farms", to_person_name: "Sofia Hernandez", from_person_name: "Jordan Lee", purpose_reason: "Irrigation sensor demo", tone: "casual", key_points: "35% water savings", context: "Expanding to Jalisco", subject_context: "Irrigation sensors", additional_details: "Spanish-speaking support available" },
  { email: "kenji@tanakadesign.example.com", company_name: "Tanaka Design Studio", to_person_name: "Kenji Tanaka", from_person_name: "Jordan Lee", purpose_reason: "Hire for a rebrand", tone: "respectful", key_points: "Brand refresh; packaging", context: "Saw their award-winning packaging", subject_context: "Rebrand project", additional_details: "Budget approved for Q4" },
  { email: "amara@okafor-legal.example.com", company_name: "Okafor Legal", to_person_name: "Amara Okafor", from_person_name: "Jordan Lee", purpose_reason: "Contract review software", tone: "professional", key_points: "Clause library; audit trail", context: "Growing litigation team", subject_context: "Contract review", additional_details: "SOC 2 certified" },
  { email: "noah@northwind.example.com", company_name: "Northwind Analytics", to_person_name: "Noah Fischer", from_person_name: "Jordan Lee", purpose_reason: "Data pipeline consulting", tone: "direct", key_points: "Cut ETL cost by half", context: "Hiring data engineers", subject_context: "ETL costs", additional_details: "Case study on request" },
  { email: "elena@bluepeak.example.com", company_name: "BluePeak Energy", to_person_name: "Elena Rossi", from_person_name: "Jordan Lee", purpose_reason: "Solar monitoring integration", tone: "warm", key_points: "API integration; alerts", context: "Opening a new 50MW plant", subject_context: "Solar monitoring", additional_details: "Can meet in Munich" },
];
const PEOPLE = BODY_MODE ? BASE_PEOPLE.map((p) => ({ ...p, email_body: WRITTEN_BODY })) : BASE_PEOPLE;

const wordsOf = (s) => s.toLowerCase().match(/[a-z0-9']+/g) ?? [];
function keptRatio(original, adapted) {
  const have = new Set(wordsOf(adapted));
  const orig = wordsOf(original).filter((w) => !["rahul", "sam"].includes(w));
  return orig.filter((w) => have.has(w)).length / orig.length;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jar = new Map();
async function call(path, { method, body } = {}) {
  const m = method ?? (body === undefined ? "GET" : "POST");
  const headers = { Origin: BASE };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  if (m !== "GET" && jar.has("ecm_csrf")) headers["X-CSRF-Token"] = decodeURIComponent(jar.get("ecm_csrf"));
  const res = await fetch(BASE + path, { method: m, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}
function must(cond, msg, extra) {
  if (!cond) throw new Error(`${msg}${extra !== undefined ? `: ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
}

const stamp = Date.now();
let r = await call("/api/auth/register", { body: { name: "Live", email: `live${stamp}@example.com`, password: "correct-horse-battery" } });
must(r.status === 200, "register failed", r.data);
r = await call("/api/settings/providers", { method: "PUT", body: { ai: "openrouter", email: "mock" } });
must(r.status === 200, "provider selection failed", r.data);
r = await call("/api/settings/providers/status?refresh=1");
console.log(`AI: ${r.data.ai.label} - ${r.data.ai.connected ? "Connected" : r.data.ai.detail} | Email: ${r.data.email.label} | Mode: ${r.data.mode}`);
must(r.data.ai.connected, "OpenRouter is not connected");

r = await call("/api/contacts/import", { body: { fileName: "live.csv", rows: PEOPLE, campaign: { name: `Live OpenRouter ${stamp}` } } });
must(r.status === 200 && r.data.campaignId, "import failed", r.data);
const campaignId = r.data.campaignId;
r = await call(`/api/campaigns/${campaignId}`, {
  method: "PATCH",
  body: { aiPrompt: "Write a short business email to {{to_person_name}} at {{company_name}} about {{purpose_reason}}.", targetWords: 120 },
});
must(r.status === 200, "prompt save failed", r.data);
r = await call(`/api/campaigns/${campaignId}/generate`, { body: { mode: "missing" } });
must(r.status === 200 && r.data.queued === 7, "generate failed", r.data);

const start = Date.now();
let s;
while (Date.now() - start < 300_000) {
  s = (await call(`/api/campaigns/${campaignId}`)).data;
  if (s.queued === 0 && s.generating === 0) break;
  await sleep(2000);
}
console.log(`Generation finished in ${Math.round((Date.now() - start) / 1000)}s: generated ${s.campaign.generatedCount}, failed ${s.generationFailed}, status ${s.campaign.status}, sent ${s.campaign.sentCount}`);

const items = (await call(`/api/campaigns/${campaignId}/recipients?pageSize=50`)).data.items;
let bad = 0;
for (const p of PEOPLE) {
  const it = items.find((i) => i.contact.email === p.email);
  const subject = it?.email?.subject ?? "";
  const body = it?.email?.body ?? "";
  const text = `${subject}\n${body}`;
  const ownName = body.includes(p.to_person_name.split(" ")[0]);
  const ownCompany = BODY_MODE || text.includes(p.company_name);
  const leaked = PEOPLE.filter((o) => o !== p && (text.includes(o.to_person_name) || text.includes(o.company_name) || text.includes(o.email))).map((o) => o.company_name);
  const placeholder = /\[[A-Za-z _]+\]|\{\{.*?\}\}/.test(text);
  const kept = BODY_MODE ? keptRatio(WRITTEN_BODY, body) : 1;
  const grown = wordsOf(body).length / wordsOf(WRITTEN_BODY).length;
  const bodyOk = !BODY_MODE || (kept >= 0.8 && grown <= 1.2 && !/\bRahul\b|\bSam\b/.test(body) && body.includes(p.from_person_name));
  const ok = it?.status === "READY" && ownName && ownCompany && leaked.length === 0 && !placeholder && bodyOk;
  if (!ok) bad++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${p.to_person_name.padEnd(16)} ${p.company_name.padEnd(22)} status=${it?.status} name=${ownName} company=${ownCompany} leaked=[${leaked.join(", ")}]${BODY_MODE ? ` kept=${Math.round(kept * 100)}% length=${Math.round(grown * 100)}%` : ""} subject="${subject}"`,
  );
  if (BODY_MODE && p === PEOPLE[0]) console.log(`      body:\n${body.replace(/^/gm, "        ")}`);
  if (!ok && it?.generationError) console.log(`      error: ${it.generationError}`);
}
console.log(bad === 0 ? "All 7 live OpenRouter emails are personalized with no cross-recipient leakage." : `${bad} live emails failed checks.`);
process.exit(bad === 0 ? 0 : 1);
