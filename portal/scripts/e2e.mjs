// End-to-end check of the subscription website: signup + trial, device connection, simulated payment,
// Razorpay webhooks (signature + idempotency), device limit and removal.
// Starts its own PostgreSQL (temporary folder) and a dev server with test keys; nothing real is charged.
// Usage: node scripts/e2e.mjs
import { spawn, spawnSync } from "node:child_process";
import { createHmac, generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startLocalDb } from "./local-db.mjs";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const portalDir = path.resolve(here, "..");
const PORT = 3101;
const BASE = `http://localhost:${PORT}`;
const WEBHOOK_SECRET = "e2e-webhook-secret";

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
  async function call(p, { method, body, origin = BASE, headers: extra = {}, raw } = {}) {
    const m = method ?? (body === undefined && raw === undefined ? "GET" : "POST");
    const headers = { Origin: origin, ...extra };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(BASE + p, { method: m, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)), redirect: "manual" });
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

function decode(license) {
  return JSON.parse(Buffer.from(license.split(".")[0], "base64url").toString("utf8"));
}

async function webhook(event, entity, eventId = `evt_${randomBytes(6).toString("hex")}`, secret = WEBHOOK_SECRET) {
  const raw = JSON.stringify({ event, payload: { subscription: { entity } } });
  const sig = createHmac("sha256", secret).update(raw).digest("hex");
  return client().call("/api/billing/webhook", { raw, headers: { "content-type": "application/json", "x-razorpay-signature": sig, "x-razorpay-event-id": eventId } });
}

async function connectDevice(user, name) {
  const anon = client();
  const start = await anon.call("/api/device/start", { body: { deviceName: name } });
  const approve = await user.call("/api/device/approve", { body: { userCode: start.data.userCode.toLowerCase().replace("-", " ") } });
  const poll = await anon.call("/api/device/poll", { body: { deviceCode: start.data.deviceCode } });
  return { start, approve, poll };
}

async function run(publicKey) {
  const stamp = Date.now();
  const email = `buyer${stamp}@example.com`;
  const u = client();

  console.log("1. Signup starts the 7-day trial");
  let r = await u.call("/api/auth/signup", { body: { name: "Buyer", email, password: "short" } });
  check("weak password rejected", r.status === 400, r.data);
  r = await u.call("/api/auth/signup", { body: { name: "Buyer", email, password: "correct-horse-battery" } });
  check("signup succeeds and sets a session", r.status === 200 && u.jar.has("ecm_portal_session"), r.data);
  r = await client().call("/api/auth/signup", { body: { email, password: "correct-horse-battery" } });
  check("duplicate email rejected", r.status === 409, r.data);
  r = await client().call("/api/auth/signup", { body: { email: `x${stamp}@example.com`, password: "correct-horse-battery" }, origin: "https://evil.example" });
  check("cross-site signup blocked", r.status === 403, r.data);
  r = await client().call("/api/auth/login", { body: { email, password: "wrong-password" } });
  check("wrong password rejected", r.status === 401, r.data);
  r = await u.call("/account");
  check("account page shows the free trial", r.status === 200 && String(r.data).includes("Free trial"), r.status);
  r = await client().call("/account");
  check("account page needs login", r.status >= 300 && r.status < 400 && (r.headers.get("location") ?? "").includes("/login"), r.status);

  console.log("2. Connect a PC (device code flow)");
  const anon = client();
  const start = await anon.call("/api/device/start", { body: { deviceName: "Office PC" } });
  check("device code issued", start.status === 200 && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(start.data.userCode) && start.data.verificationUrl.includes("/activate?code="), start.data);
  r = await anon.call("/api/device/poll", { body: { deviceCode: start.data.deviceCode } });
  check("poll is pending before confirmation", r.data.status === "pending", r.data);
  r = await u.call(`/activate?code=${start.data.userCode}`);
  check("activate page renders for the logged-in user", r.status === 200 && String(r.data).includes("Connect your PC"), r.status);
  r = await u.call("/api/device/approve", { body: { userCode: "ZZZZ-ZZZZ" } });
  check("wrong code rejected", r.status === 404, r.data);
  r = await u.call("/api/device/approve", { body: { userCode: start.data.userCode } });
  check("code confirmed", r.status === 200 && r.data.deviceName === "Office PC", r.data);
  r = await anon.call("/api/device/poll", { body: { deviceCode: start.data.deviceCode } });
  const device = r.data;
  check("app collects device credentials + license", r.data.status === "approved" && r.data.deviceSecret && r.data.license, r.data);
  const p1 = decode(device.license);
  check("license is a trial for ~7 days, offline window 7 days", p1.kind === "trial" && p1.email === email && Math.round((new Date(p1.entitledUntil) - Date.now()) / 86_400_000) === 7, p1);
  r = await anon.call("/api/device/poll", { body: { deviceCode: start.data.deviceCode } });
  check("credentials are handed out only once", r.data.status === "expired", r.data);

  const { verify, createPublicKey } = await import("node:crypto");
  const [body, sig] = device.license.split(".");
  const key = createPublicKey({ key: Buffer.from(publicKey, "base64"), format: "der", type: "spki" });
  check("license signature verifies with the public key", verify(null, Buffer.from(body), key, Buffer.from(sig, "base64url")));

  const refresh = (secret = device.deviceSecret) => client().call("/api/license/refresh", { body: { deviceId: device.deviceId, deviceSecret: secret } });
  r = await refresh("x".repeat(43));
  check("refresh with a wrong secret rejected", r.status === 401, r.data);

  console.log("3. Subscribe (simulated checkout)");
  r = await client().call("/api/billing/subscribe", { body: { plan: "MONTHLY" } });
  check("subscribe needs login", r.status === 401, r.data);
  r = await u.call("/api/billing/subscribe", { body: { plan: "MONTHLY" } });
  const subId = r.data.subscriptionId;
  check("subscription created (mock mode)", r.status === 200 && r.data.mock === true && /^mock_sub_/.test(subId), r.data);
  r = await u.call("/api/billing/verify", { body: { mock: true, subscriptionId: "mock_sub_other" } });
  check("verify rejects a different subscription id", r.status === 400, r.data);
  r = await u.call("/api/billing/verify", { body: { mock: true, subscriptionId: subId } });
  check("payment verified", r.status === 200, r.data);
  r = await refresh();
  const p2 = decode(r.data.license);
  check("refreshed license is paid, starting after the trial", r.status === 200 && p2.kind === "paid" && new Date(p2.entitledUntil) > new Date(p1.entitledUntil), p2);

  console.log("4. Razorpay webhooks");
  r = await webhook("subscription.cancelled", { id: subId, current_end: Math.floor(Date.now() / 1000) - 60 }, undefined, "wrong-secret");
  check("webhook with a bad signature rejected", r.status === 400, r.data);
  const halted = `evt_halt_${stamp}`;
  r = await webhook("subscription.halted", { id: subId }, halted);
  check("halted webhook applied", r.status === 200 && r.data.applied === true, r.data);
  r = await refresh();
  check("license after halt: not entitled", decode(r.data.license).kind === "none" && decode(r.data.license).entitledUntil === null, decode(r.data.license));
  // Beyond the period the simulated payment granted (trial end + 30 days); earlier dates never shorten access.
  const future = Math.floor(Date.now() / 1000) + 45 * 86400;
  r = await webhook("subscription.charged", { id: subId, current_end: future, notes: { userId: "ignored", plan: "MONTHLY" } });
  check("charged webhook applied", r.status === 200 && r.data.applied === true, r.data);
  r = await webhook("subscription.halted", { id: subId }, halted);
  check("replayed event ignored (idempotent)", r.status === 200 && r.data.duplicate === true, r.data);
  r = await refresh();
  check("license after renewal: paid until the new period end", decode(r.data.license).kind === "paid" && Math.abs(new Date(decode(r.data.license).entitledUntil) - future * 1000) < 2000, decode(r.data.license));
  r = await webhook("payment.captured", { id: "pay_x" });
  check("unrelated events acknowledged", r.status === 200, r.data);
  r = await u.call("/api/billing/cancel", { body: {} });
  check("cancel succeeds", r.status === 200, r.data);
  r = await refresh();
  check("cancelled: access continues to the period end", decode(r.data.license).kind === "paid", decode(r.data.license));

  console.log("5. Device limit and removal");
  const second = await connectDevice(u, "Laptop");
  check("second PC connects", second.approve.status === 200 && second.poll.data.status === "approved", second);
  const third = await connectDevice(u, "Home PC");
  check("third PC refused (limit 2)", third.approve.status === 409 && third.approve.data.code === "DEVICE_LIMIT", third.approve.data);
  r = await client().call("/api/device/revoke", { body: { deviceId: device.deviceId } });
  check("revoke needs login", r.status === 401, r.data);
  r = await u.call("/api/device/revoke", { body: { deviceId: device.deviceId } });
  check("first PC removed", r.status === 200, r.data);
  r = await refresh();
  check("removed PC can no longer refresh", r.status === 401 && r.data.code === "REVOKED", r.data);
  const again = await connectDevice(u, "Home PC");
  check("a freed slot can be used again", again.poll.data.status === "approved", again.poll.data);

  console.log("6. Logout");
  r = await u.call("/api/auth/logout", { method: "POST" });
  r = await u.call("/account");
  check("logged out", r.status >= 300 && r.status < 400, r.status);

  await desktopApp(publicKey);
}

/** The desktop shell's license manager (desktop/license.cjs) against this website. */
async function desktopApp(publicKey) {
  console.log("7. Desktop app: Connect account, refresh, removal");
  const { LicenseManager } = require(path.join(portalDir, "..", "desktop", "license.cjs"));
  const tmp = mkdtempSync(path.join(os.tmpdir(), "portal-e2e-app-"));
  let cfg = { deviceId: "", deviceSecret: "" };
  let changes = 0;
  const manager = new LicenseManager({
    file: path.join(tmp, "license.json"),
    settings: { portalUrl: BASE, publicKey, enabled: true },
    getConfig: () => cfg,
    saveConfig: (patch) => (cfg = { ...cfg, ...patch }),
    log: () => {},
    onChange: () => changes++,
  });
  try {
    check("not connected at first", manager.status().state === "missing" && !manager.connected());
    const user = client();
    await user.call("/api/auth/signup", { body: { email: `app${Date.now()}@example.com`, password: "correct-horse-battery" } });
    const events = [];
    await manager.connect({
      code: (userCode, url) => {
        events.push(["code", userCode, url]);
        user.call("/api/device/approve", { body: { userCode } });
      },
      done: (email) => events.push(["done", email]),
      error: (message) => events.push(["error", message]),
    });
    check("code shown with the activate link", events[0]?.[0] === "code" && events[0][2].startsWith(`${BASE}/activate?code=`), events);
    check("connect finishes after confirmation on the website", events.at(-1)?.[0] === "done", events);
    check("device credentials saved, license on trial", manager.connected() && manager.status().state === "trial" && changes > 0, manager.status());
    const before = JSON.parse(readFileSync(path.join(tmp, "license.json"), "utf8")).savedAt;
    await sleep(20);
    const refreshed = await manager.refresh();
    check("refresh writes a fresh license", refreshed.ok && JSON.parse(readFileSync(path.join(tmp, "license.json"), "utf8")).savedAt !== before, refreshed);
    const devices = await user.call("/account");
    const deviceId = cfg.deviceId;
    check("PC listed on the account page", String(devices.data).includes(os.hostname().slice(0, 20)), devices.status);
    await user.call("/api/device/revoke", { body: { deviceId } });
    const after = await manager.refresh();
    check("removed on the website: app disconnects itself", after.reason === "revoked" && !manager.connected() && manager.status().state === "missing", after);
    const offline = new LicenseManager({
      file: path.join(tmp, "x.json"),
      settings: { portalUrl: "http://127.0.0.1:9", publicKey, enabled: true },
      getConfig: () => ({ deviceId: "d", deviceSecret: "s".repeat(43) }),
      saveConfig: () => {},
      log: () => {},
    });
    const net = await offline.refresh();
    check("website unreachable: keeps the current license (network error only)", net.reason === "network", net);
  } finally {
    manager.stop();
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function waitForServer(proc) {
  const started = Date.now();
  while (Date.now() - started < 180_000) {
    if (proc.exitCode !== null) throw new Error("The portal dev server exited.");
    try {
      const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(60_000) });
      if (res.status < 500) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error("The portal dev server did not start.");
}

async function main() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "portal-e2e-"));
  const db = await startLocalDb({ dataDir: path.join(tmp, "data"), port: 47902 });
  let server = null;
  try {
    const env = { ...process.env, DATABASE_URL: db.connectionString };
    const migrate = spawnSync("npx prisma migrate deploy", { cwd: portalDir, env, shell: true, encoding: "utf8" });
    if (migrate.status !== 0) throw new Error(`migrate failed: ${migrate.stdout}${migrate.stderr}`);

    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const priv = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
    const pub = publicKey.export({ format: "der", type: "spki" }).toString("base64");
    server = spawn(`npx next dev -p ${PORT}`, {
      cwd: portalDir,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...env,
        APP_URL: BASE,
        SESSION_SECRET: randomBytes(32).toString("hex"),
        RAZORPAY_KEY_ID: "",
        RAZORPAY_KEY_SECRET: "",
        RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
        LICENSE_SIGNING_KEY: priv,
        TRIAL_DAYS: "7",
        MAX_DEVICES: "2",
      },
    });
    let log = "";
    server.stdout.on("data", (d) => (log += d));
    server.stderr.on("data", (d) => (log += d));
    try {
      await waitForServer(server);
    } catch (err) {
      console.log(log.slice(-3000));
      throw err;
    }
    await run(pub);
    if (failed) console.log(log.slice(-3000));
  } finally {
    if (server?.pid) spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
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
