// Desktop settings in %APPDATA%/Email Campaign Manager/config.json (folder name kept from before the Sorts rename).
// Secrets are encrypted with Electron safeStorage (Windows DPAPI, tied to this Windows user).
const { app, safeStorage } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SECRET_KEYS = ["sessionSecret", "tokenEncryptionKey", "dbPassword", "openrouterApiKey", "googleClientSecret", "deviceSecret"];

const DEFAULTS = {
  port: 47821,
  dbPort: 47822,
  openrouterModel: "openai/gpt-4o-mini",
  openrouterApiKey: "",
  googleClientId: "",
  googleClientSecret: "",
  deviceId: "",
  deviceSecret: "",
};

function configFile() {
  return path.join(app.getPath("userData"), "config.json");
}

function encrypt(value) {
  if (!value) return "";
  return safeStorage.isEncryptionAvailable() ? `enc:${safeStorage.encryptString(value).toString("base64")}` : `plain:${value}`;
}

function decrypt(stored) {
  if (!stored) return "";
  if (stored.startsWith("plain:")) return stored.slice(6);
  if (stored.startsWith("enc:")) return safeStorage.decryptString(Buffer.from(stored.slice(4), "base64"));
  return "";
}

function save(config) {
  const out = {};
  for (const [k, v] of Object.entries(config)) out[k] = SECRET_KEYS.includes(k) ? encrypt(v) : v;
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  const tmp = `${configFile()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, configFile());
}

/** Loads the config, creating the server secrets and database password on first run. */
function load() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(configFile(), "utf8").replace(/^\uFEFF/, ""));
  } catch {
    raw = {};
  }
  const config = { ...DEFAULTS };
  for (const [k, v] of Object.entries(raw)) config[k] = SECRET_KEYS.includes(k) ? decrypt(v) : v;

  // Never regenerated once set: the encryption key protects stored Gmail tokens.
  const generated = {
    sessionSecret: () => crypto.randomBytes(48).toString("base64url"),
    tokenEncryptionKey: () => crypto.randomBytes(32).toString("base64"),
    dbPassword: () => crypto.randomBytes(24).toString("base64url"),
  };
  let changed = !fs.existsSync(configFile());
  for (const [key, make] of Object.entries(generated)) {
    if (!config[key]) {
      config[key] = make();
      changed = true;
    }
  }
  if (changed) save(config);
  return config;
}

function isConfigured(config) {
  return Boolean(config.openrouterApiKey && config.googleClientId && config.googleClientSecret);
}

/** Fields the setup window may read and change. Secrets are reported only as set/not set. */
function publicView(config) {
  return {
    port: config.port,
    openrouterModel: config.openrouterModel,
    googleClientId: config.googleClientId,
    hasOpenrouterApiKey: Boolean(config.openrouterApiKey),
    hasGoogleClientSecret: Boolean(config.googleClientSecret),
    redirectUri: `http://localhost:${config.port}/api/oauth/google/callback`,
  };
}

function applyUpdate(config, input) {
  const next = { ...config };
  const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  if (str(input.openrouterApiKey, 500)) next.openrouterApiKey = str(input.openrouterApiKey, 500);
  if (str(input.googleClientSecret, 500)) next.googleClientSecret = str(input.googleClientSecret, 500);
  if (typeof input.googleClientId === "string") next.googleClientId = str(input.googleClientId, 300);
  if (str(input.openrouterModel, 200)) next.openrouterModel = str(input.openrouterModel, 200);
  save(next);
  return next;
}

module.exports = { load, save, isConfigured, publicView, applyUpdate };
