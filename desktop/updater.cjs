// Auto-update: checks the portal for a newer release (latest.json), downloads the installer in the
// background, verifies its SHA-512 and installs it silently on restart or quit.
const { app, dialog, net } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const FIRST_CHECK_MS = 30_000;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

function versionLabel(version) {
  return `v${Number.parseInt(version, 10) || 0}`;
}

function isNewer(candidate, current) {
  const a = candidate.split(".").map(Number);
  const b = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

function feedUrl() {
  const raw = (process.env.ECM_UPDATE_URL || require("./package.json").updateUrl || "").replace(/\/+$/, "");
  if (!raw) return null;
  const u = new URL(raw);
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  // Integrity is checked with SHA-512, but authenticity relies on TLS.
  if (u.protocol !== "https:" && !local) throw new Error(`Update address must use https: ${raw}`);
  return raw;
}

function parseRelease(json) {
  const ok =
    json &&
    typeof json.version === "string" &&
    /^\d+\.\d+\.\d+$/.test(json.version) &&
    typeof json.file === "string" &&
    /^[\w .-]+\.exe$/.test(json.file) &&
    typeof json.sha512 === "string" &&
    json.sha512.length > 40;
  if (!ok) throw new Error("The update information from the server is invalid.");
  return { version: json.version, file: json.file, sha512: json.sha512, notes: typeof json.notes === "string" ? json.notes : "" };
}

/**
 * @param {{ log: (l: string) => void, getWindow: () => Electron.BrowserWindow | null, confirmRestart: () => Promise<boolean> }} deps
 */
function createUpdater({ log, getWindow, confirmRestart }) {
  const dir = () => path.join(app.getPath("userData"), "updates");
  let ready = null; // { version, installer, notes }
  let pending = null; // { installer, relaunch }
  let busy = false;
  let timer = null;

  const parent = () => {
    const w = getWindow();
    return w && w.isVisible() ? w : undefined;
  };
  const message = (opts) => (parent() ? dialog.showMessageBox(parent(), opts) : dialog.showMessageBox(opts));

  async function download(base, release) {
    fs.mkdirSync(dir(), { recursive: true });
    for (const name of fs.readdirSync(dir())) if (name !== release.file) fs.rmSync(path.join(dir(), name), { force: true });
    const target = path.join(dir(), release.file);
    if (fs.existsSync(target) && (await hashFile(target)) === release.sha512) return target;

    const res = await net.fetch(`${base}/${encodeURIComponent(release.file)}`, { cache: "no-store" });
    if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status}).`);
    const part = `${target}.part`;
    const hash = crypto.createHash("sha512");
    const tap = new Transform({
      transform(chunk, _enc, cb) {
        hash.update(chunk);
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(res.body), tap, fs.createWriteStream(part));
    if (hash.digest("base64") !== release.sha512) {
      fs.rmSync(part, { force: true });
      throw new Error("The downloaded update is damaged (checksum mismatch).");
    }
    fs.renameSync(part, target);
    return target;
  }

  async function prompt() {
    if (!ready) return;
    const { response } = await message({
      type: "info",
      title: "Update ready",
      message: `${versionLabel(ready.version)} is ready to install`,
      detail: `${ready.notes ? `${ready.notes}\n\n` : ""}You are on ${versionLabel(app.getVersion())}. The app closes, updates and opens again (about a minute). Your campaigns and settings are kept.`,
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      if (!(await confirmRestart())) return;
      pending = { installer: ready.installer, relaunch: true };
      log(`[update] restarting to install ${ready.version}`);
      app.quit();
    } else {
      pending = { installer: ready.installer, relaunch: false };
      log(`[update] ${ready.version} will install on quit`);
    }
  }

  async function check({ manual = false } = {}) {
    if (busy) return;
    if (!app.isPackaged) {
      if (manual) await message({ type: "info", title: "Updates", message: "Updates only work in the installed app." });
      return;
    }
    if (ready) {
      if (manual) await prompt();
      return;
    }
    busy = true;
    try {
      const base = feedUrl();
      if (!base) throw new Error("No update address is configured.");
      const res = await net.fetch(`${base}/latest.json`, { cache: "no-store" });
      if (res.status === 404) {
        if (manual) await message({ type: "info", title: "Updates", message: `You have the latest version (${versionLabel(app.getVersion())}).` });
        return;
      }
      if (!res.ok) throw new Error(`The update server answered HTTP ${res.status}.`);
      const release = parseRelease(await res.json());
      if (!isNewer(release.version, app.getVersion())) {
        log(`[update] up to date (${app.getVersion()})`);
        if (manual) await message({ type: "info", title: "Updates", message: `You have the latest version (${versionLabel(app.getVersion())}).` });
        return;
      }
      log(`[update] downloading ${release.version}`);
      const installer = await download(base, release);
      ready = { version: release.version, installer, notes: release.notes };
      log(`[update] ${release.version} downloaded`);
      await prompt();
    } catch (err) {
      log(`[update] check failed: ${err?.stack ?? err}`);
      if (manual) await message({ type: "warning", title: "Updates", message: "Could not check for updates.", detail: String(err?.message ?? err) });
    } finally {
      busy = false;
    }
  }

  return {
    start() {
      if (!app.isPackaged || timer) return;
      setTimeout(() => void check(), FIRST_CHECK_MS);
      timer = setInterval(() => void check(), CHECK_EVERY_MS);
    },
    check,
    /** Call after the server and database have stopped, right before the process exits. */
    installIfPending() {
      if (!pending || !fs.existsSync(pending.installer)) return;
      log(`[update] launching installer${pending.relaunch ? " (relaunch)" : ""}`);
      const args = ["/S", ...(pending.relaunch ? ["--force-run"] : [])];
      spawn(pending.installer, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
      pending = null;
    },
  };
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha512");
    fs.createReadStream(file)
      .on("data", (d) => hash.update(d))
      .on("end", () => resolve(hash.digest("base64")))
      .on("error", reject);
  });
}

module.exports = { createUpdater, versionLabel };
