// End-to-end check of the subscription send guard in the built desktop server (desktop/app-server):
// no license / expired / offline / tampered licenses block sending with 402, a valid one allows it,
// and scheduled campaigns are paused (not failed) when the subscription ends.
// Needs `npm run desktop:prepare` first. Starts its own PostgreSQL in a temporary folder.
// Usage: node scripts/license-e2e.mjs
import { spawn, spawnSync } from "node:child_process";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startLocalDb } from "../portal/scripts/local-db.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "desktop", "app-server");
const PORT = 3102;
const BASE = `http://localhost:${PORT}`;
const DAY = 86_400_000;

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
  async function call(p, { method, body } = {}) {
    const m = method ?? (body === undefined ? "GET" : "POST");
    const headers = { Origin: BASE };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    if (m !== "GET" && jar.has("ecm_csrf")) headers["X-CSRF-Token"] = decodeURIComponent(jar.get("ecm_csrf"));
    const res = await fetch(BASE + p, { method: m, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
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
    return { status: res.status, data };
  }
  return { call };
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PUBLIC_KEY = publicKey.export({ format: "der", type: "spki" }).toString("base64");

function token({ kind = "paid", entitledUntil = new Date(Date.now() + 30 * DAY), expiresAt = new Date(Date.now() + 7 * DAY), key = privateKey } = {}) {
  const payload = {
    v: 1,
    sub: "u1",
    email: "buyer@example.com",
    deviceId: "d1",
    kind,
    entitledUntil: entitledUntil ? entitledUntil.toISOString() : null,
    issuedAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(null, Buffer.from(body), key).toString("base64url")}`;
}

async function run(licenseFile, pg, connectionString) {
  const write = (t) => {
    writeFileSync(licenseFile, JSON.stringify({ license: t, email: "buyer@example.com" }));
    // mtime resolution: make sure the next write is seen as a change
    return sleep(50);
  };
  const u = client();
  const stamp = Date.now();

  console.log("1. No license");
  let r = await u.call("/api/auth/register", { body: { name: "Owner", email: `owner${stamp}@example.com`, password: "correct-horse-battery" } });
  check("register", r.status === 200, r.data);
  r = await u.call("/api/license");
  check("license state: missing, sending locked, website link given", r.data.required === true && r.data.state === "missing" && r.data.canSend === false && r.data.portalUrl === "https://portal.example", r.data);
  r = await u.call("/api/bulk/import", {
    body: {
      headers: ["company_name", "to_name", "email"],
      rows: [
        { company_name: "Helix", to_name: "Meera", email: "meera@helix.example" },
        { company_name: "Orion", to_name: "Tom", email: "tom@orion.example" },
      ],
      campaignName: `License ${stamp}`,
      fileName: "contacts.csv",
    },
  });
  const id = r.data.campaignId;
  check("contacts import still works without a subscription", r.status === 201 && id, r.data);
  const sendBody = { confirmText: "APPROVE & SEND ALL", startMode: "now", intervalSeconds: 30 };
  r = await u.call(`/api/campaigns/${id}/bulk/send`, { body: sendBody });
  check("send refused with 402 PAYMENT_REQUIRED", r.status === 402 && r.data.error?.code === "PAYMENT_REQUIRED", r.data);

  console.log("2. Valid licenses");
  await write(token({ kind: "trial", entitledUntil: new Date(Date.now() + 3 * DAY) }));
  r = await u.call("/api/license");
  check("trial license: sending allowed", r.data.state === "trial" && r.data.canSend === true, r.data);
  await write(token());
  r = await u.call("/api/license");
  check("paid license: active", r.data.state === "active" && r.data.canSend === true && r.data.email === "buyer@example.com", r.data);
  r = await u.call(`/api/campaigns/${id}/bulk/send`, { body: sendBody });
  check("send passes the subscription check (stops later: nothing generated yet)", r.status !== 402 && r.data.error?.code !== "PAYMENT_REQUIRED", r.data);

  console.log("3. Invalid licenses");
  await write(token({ entitledUntil: new Date(Date.now() - DAY) }));
  r = await u.call("/api/license");
  check("ended subscription: expired", r.data.state === "expired" && !r.data.canSend && /ended/.test(r.data.message), r.data);
  await write(token({ expiresAt: new Date(Date.now() - 1000) }));
  r = await u.call("/api/license");
  check("not refreshed for 7 days: offline", r.data.state === "offline" && !r.data.canSend, r.data);
  await write(token({ key: generateKeyPairSync("ed25519").privateKey }));
  r = await u.call("/api/license");
  check("license signed by another key: invalid", r.data.state === "invalid" && !r.data.canSend, r.data);
  const good = token();
  const [b, s] = good.split(".");
  const forged = Buffer.from(Buffer.from(b, "base64url").toString().replace("buyer@", "other@")).toString("base64url");
  await write(`${forged}.${s}`);
  r = await u.call("/api/license");
  check("edited license: invalid", r.data.state === "invalid", r.data);

  console.log("4. Scheduled campaign when the subscription ends");
  await write(token({ entitledUntil: new Date(Date.now() - DAY) }));
  const client2 = new pg.Client({ connectionString });
  await client2.connect();
  try {
    await client2.query(`UPDATE campaigns SET status = 'SCHEDULED' WHERE id = $1`, [id]);
    let row = null;
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      row = (await client2.query(`SELECT status, paused_reason FROM campaigns WHERE id = $1`, [id])).rows[0];
      if (row.status !== "SCHEDULED") break;
    }
    check("worker pauses it (not failed) with the reason", row?.status === "PAUSED" && /ended/.test(row?.paused_reason ?? ""), row);
  } finally {
    await client2.end();
  }
  r = await u.call(`/api/campaigns/${id}/send/resume`, { body: { confirm: true } });
  check("resume refused with 402", r.status === 402, r.data);
  await write(token());
  r = await u.call(`/api/campaigns/${id}/send/resume`, { body: { confirm: true } });
  check("after subscribing, resume passes the subscription check", r.status !== 402, r.data);
}

async function waitForServer(proc) {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    if (proc.exitCode !== null) throw new Error("The app server exited.");
    try {
      const res = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(10_000) });
      if (res.status < 500) return;
    } catch {}
    await sleep(500);
  }
  throw new Error("The app server did not start.");
}

async function main() {
  if (!existsSync(path.join(serverDir, "server.js"))) throw new Error("Run `npm run desktop:prepare` first.");
  const tmp = mkdtempSync(path.join(os.tmpdir(), "license-e2e-"));
  const db = await startLocalDb({ dataDir: path.join(tmp, "data"), port: 47903 });
  const pg = require(path.join(serverDir, "node_modules", "pg"));
  let server = null;
  try {
    const migrate = spawnSync("npx prisma migrate deploy", { cwd: root, env: { ...process.env, DATABASE_URL: db.connectionString }, shell: true, encoding: "utf8" });
    if (migrate.status !== 0) throw new Error(`migrate failed: ${migrate.stdout}${migrate.stderr}`);
    const licenseFile = path.join(tmp, "license.json");
    const env = { ...process.env };
    for (const k of ["AI_PROVIDER", "EMAIL_PROVIDER", "AUTO_LOGIN", "DESKTOP_MODE", "DESKTOP_TOKEN"]) delete env[k];
    server = spawn(process.execPath, [path.join(serverDir, "server.js")], {
      cwd: serverDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...env,
        NODE_ENV: "production",
        PORT: String(PORT),
        HOSTNAME: "127.0.0.1",
        APP_URL: BASE,
        DATABASE_URL: db.connectionString,
        SESSION_SECRET: randomBytes(32).toString("hex"),
        TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
        ALLOW_REGISTRATION: "true",
        LICENSE_REQUIRED: "true",
        LICENSE_FILE: licenseFile,
        LICENSE_PUBLIC_KEY: PUBLIC_KEY,
        PORTAL_URL: "https://portal.example",
      },
    });
    let log = "";
    server.stdout.on("data", (d) => (log += d));
    server.stderr.on("data", (d) => (log += d));
    await waitForServer(server).catch((err) => {
      console.log(log.slice(-3000));
      throw err;
    });
    await run(licenseFile, pg, db.connectionString);
    if (failed) console.log(log.slice(-3000));
  } finally {
    server?.kill();
    await sleep(500);
    await db.stop().catch(() => {});
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
