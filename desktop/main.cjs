// Electron shell: bundled PostgreSQL + the Next.js standalone server, shown in a desktop window.
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, powerMonitor, session, shell } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const config = require("./config.cjs");
const { LicenseManager, loadLicenseConfig } = require("./license.cjs");
const { migrate } = require("./migrate.cjs");
const { LocalPostgres, portFree } = require("./postgres.cjs");
const { createUpdater, versionLabel } = require("./updater.cjs");

const APP_NAME = "Sorts";
const TOKEN_HEADER = "x-desktop-token";

// Installs from before the Sorts rename keep their database, keys (DPAPI) and license in this folder.
app.setPath("userData", path.join(app.getPath("appData"), "Email Campaign Manager"));

const paths = {
  server: app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(__dirname, "app-server"),
  pgBin: app.isPackaged
    ? path.join(process.resourcesPath, "postgres", "bin")
    : path.join(__dirname, "..", "node_modules", "@embedded-postgres", "windows-x64", "native", "bin"),
  migrations: app.isPackaged ? path.join(process.resourcesPath, "migrations") : path.join(__dirname, "..", "prisma", "migrations"),
  icon: path.join(__dirname, "assets", "icon.png"),
  data: () => path.join(app.getPath("userData"), "data"),
  logs: () => path.join(app.getPath("userData"), "logs"),
  license: () => path.join(app.getPath("userData"), "license.json"),
};

let cfg = null;
let license = null;
let connectWindow = null;
let db = null;
let pg = null;
let serverProc = null;
let token = "";
let mainWindow = null;
let setupWindow = null;
let tray = null;
let quitting = false;
let cleanedUp = false;
let restarting = false;
let gmailPending = false;

const updater = createUpdater({
  log,
  getWindow: () => mainWindow,
  confirmRestart: async () => {
    const active = await activeCampaigns();
    if (!active) return true;
    const choice = dialog.showMessageBoxSync({
      type: "question",
      title: APP_NAME,
      message: `${active} campaign${active === 1 ? " is" : "s are"} scheduled or sending.`,
      detail: "Sending pauses while the app updates and continues when it opens again.",
      buttons: ["Update now", "Cancel"],
      defaultId: 0,
      cancelId: 1,
    });
    return choice === 0;
  },
});

const baseUrl = () => `http://localhost:${cfg.port}`;

function log(line) {
  try {
    fs.mkdirSync(paths.logs(), { recursive: true });
    fs.appendFileSync(path.join(paths.logs(), "desktop.log"), `${new Date().toISOString()} ${String(line).trimEnd()}\n`);
  } catch {
    // logging must never break the app
  }
}

function fail(title, err) {
  log(`${title}: ${err?.stack ?? err}`);
  dialog.showErrorBox(title, `${err?.message ?? err}\n\nDetails are in ${path.join(paths.logs(), "desktop.log")}`);
}

// ---------------------------------------------------------------- server

function waitForServer(timeoutMs = 90_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: "127.0.0.1", port: cfg.port, path: "/login", timeout: 3000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else retry();
      });
      req.on("error", retry);
      req.on("timeout", () => req.destroy());
    };
    const retry = () => {
      if (serverProc === null) return reject(new Error("The app server stopped while starting."));
      if (Date.now() - started > timeoutMs) return reject(new Error("The app server did not start in time."));
      setTimeout(attempt, 500);
    };
    attempt();
  });
}

async function startServer() {
  if (!(await portFree(cfg.port))) {
    throw new Error(`Port ${cfg.port} is already in use. Close the other program (or another copy of this app) and try again.`);
  }
  token = crypto.randomBytes(32).toString("hex");
  const env = { ...process.env };
  for (const key of ["AI_PROVIDER", "EMAIL_PROVIDER", "AUTO_LOGIN", "DATABASE_URL", "LICENSE_FILE", "LICENSE_PUBLIC_KEY", "LICENSE_REQUIRED", "PORTAL_URL"]) {
    delete env[key];
  }
  if (license.enabled) {
    Object.assign(env, { LICENSE_FILE: paths.license(), LICENSE_PUBLIC_KEY: license.settings.publicKey, PORTAL_URL: license.settings.portalUrl });
  }
  Object.assign(env, {
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    PORT: String(cfg.port),
    HOSTNAME: "127.0.0.1",
    APP_URL: baseUrl(),
    DATABASE_URL: db.connectionString,
    DATABASE_POOL_MAX: "5",
    SESSION_SECRET: cfg.sessionSecret,
    TOKEN_ENCRYPTION_KEY: cfg.tokenEncryptionKey,
    OPENROUTER_API_KEY: cfg.openrouterApiKey,
    OPENROUTER_MODEL: cfg.openrouterModel,
    GOOGLE_CLIENT_ID: cfg.googleClientId,
    GOOGLE_CLIENT_SECRET: cfg.googleClientSecret,
    GOOGLE_REDIRECT_URI: `${baseUrl()}/api/oauth/google/callback`,
    ALLOW_REGISTRATION: "false",
    DESKTOP_MODE: "true",
    DESKTOP_TOKEN: token,
  });

  const proc = spawn(process.execPath, [path.join(paths.server, "server.js")], { cwd: paths.server, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  serverProc = proc;
  proc.stdout.on("data", (d) => log(`[server] ${d}`));
  proc.stderr.on("data", (d) => log(`[server] ${d}`));
  proc.on("exit", (code) => {
    log(`[server] exited with code ${code}`);
    if (serverProc === proc) serverProc = null;
    if (!quitting && !restarting) {
      const choice = dialog.showMessageBoxSync({
        type: "error",
        title: APP_NAME,
        message: "The app server stopped unexpectedly.",
        detail: `Details are in ${path.join(paths.logs(), "desktop.log")}`,
        buttons: ["Restart", "Quit"],
      });
      if (choice === 0) restartServer().catch((err) => fail("Could not restart", err));
      else app.quit();
    }
  });
  await waitForServer();
}

function stopServer() {
  const proc = serverProc;
  if (!proc) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 10_000);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    proc.kill();
  });
}

async function restartServer() {
  restarting = true;
  try {
    await stopServer();
    await startServer();
  } finally {
    restarting = false;
  }
  openApp();
}

// ---------------------------------------------------------------- database

async function startDatabase() {
  db = new LocalPostgres({ binDir: paths.pgBin, dataDir: path.join(paths.data(), "pgdata"), port: cfg.dbPort, password: cfg.dbPassword, log: (l) => log(`[postgres] ${l}`) });
  await db.start();
  pg = require(path.join(paths.server, "node_modules", "pg"));
  await db.ensureDatabase(pg);
  await migrate(pg, db.connectionString, paths.migrations, (l) => log(`[migrate] ${l}`));
}

async function activeCampaigns() {
  if (!db || !pg) return 0;
  const client = new pg.Client({ connectionString: db.connectionString, connectionTimeoutMillis: 3000, query_timeout: 3000 });
  try {
    await client.connect();
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM campaigns WHERE status IN ('SCHEDULED', 'RUNNING')`);
    return rows[0].n;
  } catch {
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

async function backupData() {
  const picked = await dialog.showOpenDialog(mainWindow, { title: "Choose a folder for the backup", properties: ["openDirectory", "createDirectory"] });
  if (picked.canceled || !picked.filePaths[0]) return;
  const ok = dialog.showMessageBoxSync(mainWindow, {
    type: "question",
    title: APP_NAME,
    message: "Back up all campaigns and settings?",
    detail: "The app pauses for a few seconds while the database is copied. Emails being sent right now are not interrupted mid-send, but sending pauses until the backup is done.",
    buttons: ["Back up", "Cancel"],
  });
  if (ok !== 0) return;
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const target = path.join(picked.filePaths[0], `sorts-backup-${stamp}`);
  restarting = true;
  try {
    await stopServer();
    await db.stop();
    fs.cpSync(paths.data(), target, { recursive: true });
    await db.start();
    await startServer();
  } catch (err) {
    fail("Backup failed", err);
  } finally {
    restarting = false;
  }
  openApp();
  if (fs.existsSync(target)) dialog.showMessageBox(mainWindow, { type: "info", title: APP_NAME, message: "Backup saved", detail: target });
}

// ---------------------------------------------------------------- windows

function isAppUrl(url) {
  try {
    const u = new URL(url);
    return (u.hostname === "localhost" || u.hostname === "127.0.0.1") && u.port === String(cfg.port);
  } catch {
    return false;
  }
}

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

/** Google blocks sign-in inside embedded windows, so Gmail is connected in the system browser. */
function connectGmailInBrowser() {
  gmailPending = true;
  const next = encodeURIComponent("/desktop/connect-gmail");
  openExternal(`${baseUrl()}/api/auth/auto?token=${token}&next=${next}`);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: "#070a10",
    icon: paths.icon,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  mainWindow.loadFile(path.join(__dirname, "loading.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());

  const wc = mainWindow.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) return { action: "allow" };
    openExternal(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (event, url) => {
    if (url.startsWith("file:")) return;
    if (!isAppUrl(url)) {
      event.preventDefault();
      openExternal(url);
      return;
    }
    const pathname = new URL(url).pathname;
    if (pathname === "/api/oauth/google/start") {
      event.preventDefault();
      connectGmailInBrowser();
    } else if (pathname === "/desktop/connect-account") {
      event.preventDefault();
      openConnect();
    }
  });
  mainWindow.on("focus", () => {
    if (gmailPending && isAppUrl(wc.getURL()) && new URL(wc.getURL()).pathname.startsWith("/settings")) {
      gmailPending = false;
      wc.reload();
    }
  });
  mainWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    handleClose().catch((err) => log(`close: ${err}`));
  });
}

function openApp() {
  if (!mainWindow) return;
  mainWindow.loadURL(`${baseUrl()}/api/auth/auto?next=${encodeURIComponent("/")}`);
}

async function handleClose() {
  const active = await activeCampaigns();
  log(`window closed; ${active} active campaign(s)`);
  if (!active) return app.quit();
  const choice = dialog.showMessageBoxSync(mainWindow, {
    type: "question",
    title: APP_NAME,
    message: `${active} campaign${active === 1 ? " is" : "s are"} scheduled or sending.`,
    detail: "Emails are only sent while the app is running. Keep it running in the system tray to finish sending?",
    buttons: ["Keep sending in the tray", "Quit anyway", "Cancel"],
    defaultId: 0,
    cancelId: 2,
  });
  if (choice === 0) {
    ensureTray();
    mainWindow.hide();
    tray.displayBalloon?.({ title: APP_NAME, content: "Still sending in the background. Use the tray icon to open or quit." });
  } else if (choice === 1) {
    app.quit();
  }
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function ensureTray() {
  if (tray) return;
  tray = new Tray(nativeImage.createFromPath(paths.icon).resize({ width: 16, height: 16 }));
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open", click: showMainWindow },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
  tray.on("click", showMainWindow);
}

let setupResolve = null;

/** Shows the key setup window; resolves when it is saved or closed. */
function openSetup(firstRun) {
  if (setupWindow) {
    setupWindow.focus();
    return Promise.resolve();
  }
  setupWindow = new BrowserWindow({
    title: firstRun ? `Welcome to ${APP_NAME}` : "Configure keys",
    width: 620,
    height: 760,
    resizable: false,
    minimizable: false,
    parent: mainWindow?.isVisible() ? mainWindow : undefined,
    modal: Boolean(mainWindow?.isVisible()),
    backgroundColor: "#070a10",
    icon: paths.icon,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  setupWindow.loadFile(path.join(__dirname, "setup.html"), { query: { firstRun: firstRun ? "1" : "0" } });
  setupWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  setupWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  return new Promise((resolve) => {
    setupResolve = resolve;
    setupWindow.on("closed", () => {
      setupWindow = null;
      setupResolve?.();
      setupResolve = null;
    });
  });
}

function reloadAppPage() {
  const wc = mainWindow?.webContents;
  if (wc && !wc.isDestroyed() && isAppUrl(wc.getURL())) wc.reload();
}

/** Device-code flow: shows the code here and opens the website in the system browser to confirm it. */
function openConnect() {
  if (!license.enabled) {
    dialog.showMessageBox(mainWindow, { type: "info", title: APP_NAME, message: "Subscriptions are not set up in this build.", detail: "Sending is not restricted." });
    return;
  }
  if (connectWindow) {
    connectWindow.focus();
    return;
  }
  connectWindow = new BrowserWindow({
    title: "Connect account",
    width: 500,
    height: 360,
    resizable: false,
    minimizable: false,
    parent: mainWindow?.isVisible() ? mainWindow : undefined,
    backgroundColor: "#070a10",
    icon: paths.icon,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "connect-preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  const win = connectWindow;
  win.loadFile(path.join(__dirname, "connect.html"));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const send = (state) => {
    if (!win.isDestroyed()) win.webContents.send("connect:state", state);
  };
  win.on("closed", () => {
    if (connectWindow === win) connectWindow = null;
    license.cancelConnect();
  });
  win.webContents.once("did-finish-load", () => {
    license
      .connect({
        code: (userCode, url) => {
          send({ kind: "code", userCode, url });
          openExternal(url);
        },
        done: (email) => {
          send({ kind: "done", email });
          reloadAppPage();
          if (!win.isDestroyed()) win.focus();
        },
        error: (message) => send({ kind: "error", message }),
      })
      .catch((err) => send({ kind: "error", message: `Could not reach the website: ${err.message}` }));
  });
}

ipcMain.handle("connect:open-url", (event, url) => {
  if (connectWindow && event.sender === connectWindow.webContents && typeof url === "string" && url.startsWith(`${license.settings.portalUrl}/`)) {
    openExternal(url);
  }
});

function accountMenu() {
  if (!license?.enabled) return [];
  const s = license.status();
  const until = s.until ? new Date(s.until).toLocaleDateString() : "";
  const label = {
    active: `Subscribed${until ? ` until ${until}` : ""}`,
    trial: `Free trial until ${until}`,
    expired: "Subscription ended - sending locked",
    offline: "License needs refreshing - go online",
    invalid: "License could not be verified",
    missing: "Not connected - sending locked",
  }[s.state];
  return [
    {
      label: "Account",
      submenu: [
        { label: s.email ? `${label} (${s.email})` : label, enabled: false },
        { type: "separator" },
        ...(license.connected()
          ? [
              {
                label: "Refresh subscription status",
                click: async () => {
                  const r = await license.refresh();
                  if (!r.ok && r.reason !== "revoked") dialog.showMessageBox(mainWindow, { type: "warning", title: APP_NAME, message: "Could not refresh", detail: r.message || "Check your internet connection." });
                  reloadAppPage();
                },
              },
              { label: "Manage subscription...", click: () => openExternal(`${license.settings.portalUrl}/account`) },
              {
                label: "Disconnect this PC",
                click: () => {
                  const choice = dialog.showMessageBoxSync(mainWindow, {
                    type: "question",
                    title: APP_NAME,
                    message: "Disconnect this PC from your account?",
                    detail: "Sending stops until you connect again. Your campaigns and contacts stay on this PC. To free the PC slot, also remove it on the website's account page.",
                    buttons: ["Disconnect", "Cancel"],
                    cancelId: 1,
                  });
                  if (choice === 0) {
                    license.clear();
                    reloadAppPage();
                  }
                },
              },
            ]
          : [{ label: "Connect account...", click: openConnect }]),
        { label: "Plans and pricing", click: () => openExternal(license.settings.portalUrl) },
      ],
    },
  ];
}

function fromSetupWindow(event) {
  return setupWindow && event.sender === setupWindow.webContents;
}

ipcMain.handle("setup:get", (event) => (fromSetupWindow(event) ? config.publicView(cfg) : null));
ipcMain.handle("setup:save", async (event, input) => {
  if (!fromSetupWindow(event) || typeof input !== "object" || input === null) return { ok: false };
  cfg = config.applyUpdate(cfg, input);
  setupWindow?.close();
  if (serverProc) await restartServer().catch((err) => fail("Could not restart the app server", err));
  return { ok: true };
});
ipcMain.handle("setup:open-external", (event, url) => {
  if (fromSetupWindow(event) && typeof url === "string") openExternal(url);
});

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "File",
        submenu: [
          { label: "Configure keys...", click: () => openSetup(false) },
          { label: "Back up data...", click: () => backupData() },
          { label: "Open data folder", click: () => shell.openPath(app.getPath("userData")) },
          { type: "separator" },
          { label: "Quit", accelerator: "Ctrl+Q", click: () => app.quit() },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
          ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
        ],
      },
      ...accountMenu(),
      {
        label: "Help",
        submenu: [
          {
            label: `About ${APP_NAME}`,
            click: () =>
              dialog.showMessageBox(mainWindow, {
                type: "info",
                title: APP_NAME,
                message: `${APP_NAME} ${versionLabel(app.getVersion())}`,
                detail: `Data folder: ${app.getPath("userData")}`,
              }),
          },
          { label: "Check for updates...", click: () => updater.check({ manual: true }) },
          { label: "Open log file", click: () => shell.openPath(path.join(paths.logs(), "desktop.log")) },
        ],
      },
    ]),
  );
}

// ---------------------------------------------------------------- lifecycle

async function boot() {
  cfg = config.load();
  license = new LicenseManager({
    file: paths.license(),
    settings: loadLicenseConfig(__dirname),
    getConfig: () => cfg,
    saveConfig: (patch) => {
      cfg = { ...cfg, ...patch };
      config.save(cfg);
    },
    log: (l) => log(`[license] ${l}`),
    onChange: () => buildMenu(),
  });
  buildMenu();
  createMainWindow();
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`http://localhost:${cfg.port}/*`, `http://127.0.0.1:${cfg.port}/*`] }, (details, callback) => {
    details.requestHeaders[TOKEN_HEADER] = token;
    callback({ requestHeaders: details.requestHeaders });
  });
  if (!config.isConfigured(cfg)) await openSetup(true);
  await startDatabase();
  await startServer();
  openApp();
  updater.start();
  license.startAutoRefresh();
  powerMonitor.on("resume", () => license.refresh().then(() => reloadAppPage()));
}

async function shutdown() {
  log("shutting down");
  license?.stop();
  try {
    await stopServer();
  } catch (err) {
    log(`stop server: ${err}`);
  }
  try {
    await db?.stop();
  } catch (err) {
    log(`stop postgres: ${err}`);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showMainWindow);
  app.on("window-all-closed", () => {
    // Quitting is handled explicitly (close dialog / tray / menu).
  });
  app.on("before-quit", (event) => {
    quitting = true;
    if (cleanedUp) return;
    event.preventDefault();
    shutdown().finally(() => {
      cleanedUp = true;
      updater.installIfPending();
      app.quit();
    });
  });
  app.whenReady().then(() =>
    boot().catch((err) => {
      fail(`${APP_NAME} could not start`, err);
      app.quit();
    }),
  );
}
