// Subscription license for the desktop app.
// "Connect account" = device-code flow against the website; the signed license is kept in license.json
// (read by the app server, which only allows sending while it is valid) and refreshed every 6 hours.
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REFRESH_EVERY_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

/** Portal URL and public key come from desktop/license-config.json (written at build time); env overrides for development. */
function loadLicenseConfig(dir) {
  let file = {};
  try {
    file = JSON.parse(fs.readFileSync(path.join(dir, "license-config.json"), "utf8").replace(/^\uFEFF/, ""));
  } catch {
    file = {};
  }
  const portalUrl = String(process.env.PORTAL_URL || file.portalUrl || "").replace(/\/+$/, "");
  const publicKey = String(process.env.LICENSE_PUBLIC_KEY || file.publicKey || "").trim();
  return { portalUrl, publicKey, enabled: Boolean(portalUrl && publicKey) };
}

function verifyToken(token, publicKeyB64) {
  const [body, sig, extra] = String(token || "").trim().split(".");
  if (!body || !sig || extra !== undefined) return null;
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(publicKeyB64, "base64"), format: "der", type: "spki" });
    if (!crypto.verify(null, Buffer.from(body, "utf8"), key, Buffer.from(sig, "base64url"))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload && payload.v === 1 ? payload : null;
  } catch {
    return null;
  }
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

class LicenseManager {
  /**
   * @param {object} o
   * @param {string} o.file          path of license.json
   * @param {object} o.settings      { portalUrl, publicKey, enabled }
   * @param {() => object} o.getConfig
   * @param {(patch: object) => void} o.saveConfig   persists deviceId / deviceSecret (encrypted)
   * @param {(line: string) => void} o.log
   * @param {() => void} o.onChange  called after the license file changes
   */
  constructor({ file, settings, getConfig, saveConfig, log, onChange }) {
    Object.assign(this, { file, settings, getConfig, saveConfig, log, onChange });
    this.timer = null;
    this.flow = null;
  }

  get enabled() {
    return this.settings.enabled;
  }

  connected() {
    const c = this.getConfig();
    return Boolean(c.deviceId && c.deviceSecret);
  }

  /** Current license, verified locally. */
  status(now = new Date()) {
    let saved = null;
    try {
      saved = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      saved = null;
    }
    const payload = saved ? verifyToken(saved.license, this.settings.publicKey) : null;
    if (!payload) return { state: this.connected() ? "invalid" : "missing", email: saved?.email ?? null };
    const until = payload.entitledUntil ? new Date(payload.entitledUntil) : null;
    if (new Date(payload.expiresAt) <= now) return { state: "offline", email: payload.email, until };
    if (!until || until <= now) return { state: "expired", email: payload.email, until };
    return { state: payload.kind === "trial" ? "trial" : "active", email: payload.email, until };
  }

  writeLicense(license, email) {
    if (!verifyToken(license, this.settings.publicKey)) throw new Error("The website returned a license this app cannot verify. Check LICENSE_PUBLIC_KEY.");
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ license, email, savedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    this.onChange?.();
  }

  clear() {
    this.saveConfig({ deviceId: "", deviceSecret: "" });
    fs.rmSync(this.file, { force: true });
    this.onChange?.();
  }

  /** Fetches a fresh license. Network failures keep the current one (it stays valid offline for 7 days). */
  async refresh() {
    if (!this.enabled || !this.connected()) return { ok: false, reason: "not_connected" };
    const { deviceId, deviceSecret } = this.getConfig();
    try {
      const res = await postJson(`${this.settings.portalUrl}/api/license/refresh`, { deviceId, deviceSecret });
      if (res.ok && res.data.license) {
        this.writeLicense(res.data.license, res.data.email);
        this.log(`license refreshed (${this.status().state})`);
        return { ok: true };
      }
      if (res.status === 401) {
        this.log(`license refresh rejected: ${res.data.code ?? res.status}; disconnecting`);
        this.clear();
        return { ok: false, reason: "revoked", message: res.data.error };
      }
      this.log(`license refresh failed: HTTP ${res.status}`);
      return { ok: false, reason: "server", message: res.data.error };
    } catch (err) {
      this.log(`license refresh failed: ${err.message}`);
      return { ok: false, reason: "network", message: err.message };
    }
  }

  startAutoRefresh() {
    if (!this.enabled) return;
    this.refresh();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.refresh(), REFRESH_EVERY_MS);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    this.cancelConnect();
  }

  /**
   * Starts the device-code flow. `ui` receives progress: ui.code(userCode, url), ui.done(email), ui.error(message).
   * Returns a promise that resolves when the flow finishes or is cancelled.
   */
  async connect(ui) {
    if (!this.enabled) throw new Error("Subscriptions are not configured in this build.");
    this.cancelConnect();
    const flow = { cancelled: false };
    this.flow = flow;
    const start = await postJson(`${this.settings.portalUrl}/api/device/start`, { deviceName: os.hostname().slice(0, 80) || "Windows PC" });
    if (!start.ok) throw new Error(start.data.error || `The website answered HTTP ${start.status}.`);
    const { deviceCode, userCode, verificationUrl, interval = 3, expiresIn = 900 } = start.data;
    ui.code(userCode, verificationUrl);
    const deadline = Date.now() + expiresIn * 1000;
    while (!flow.cancelled && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, Math.max(2, interval) * 1000));
      if (flow.cancelled) return;
      let res;
      try {
        res = await postJson(`${this.settings.portalUrl}/api/device/poll`, { deviceCode });
      } catch {
        continue;
      }
      const status = res.data.status;
      if (status === "pending") continue;
      if (status === "approved") {
        this.saveConfig({ deviceId: res.data.deviceId, deviceSecret: res.data.deviceSecret });
        this.writeLicense(res.data.license, res.data.email);
        this.log(`connected to ${res.data.email}`);
        this.flow = null;
        ui.done(res.data.email);
        return;
      }
      this.flow = null;
      ui.error(
        status === "device_limit"
          ? "Your account already has the maximum number of PCs. Remove one on the website's account page, then try again."
          : "The code expired. Click Connect account to get a new one.",
      );
      return;
    }
    if (!flow.cancelled) ui.error("The code expired. Click Connect account to get a new one.");
  }

  cancelConnect() {
    if (this.flow) this.flow.cancelled = true;
    this.flow = null;
  }
}

module.exports = { LicenseManager, loadLicenseConfig, verifyToken };
