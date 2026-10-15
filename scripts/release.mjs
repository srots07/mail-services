// Publishes a new desktop version for auto-update.
//
//   npm run release                      bump v1 -> v2, build the installer, publish it
//   npm run release -- --no-bump         build and publish the current version (first release)
//   npm run release -- --skip-build      publish the installer already in dist-desktop
//   npm run release -- --notes "Fixed scheduling"   short text shown in the update prompt
//   npm run release -- --out D:\portal\updates      publish folder (default: UPDATES_DIR or portal/updates)
//   npm run release -- --update-url https://portal.example.com/updates   where installed apps look for updates
//
// Versions are whole numbers shown as v1, v2, v3…; package.json stores them as 1.0.0, 2.0.0…
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = { root: path.join(root, "package.json"), desktop: path.join(root, "desktop", "package.json") };
const KEEP_INSTALLERS = 3;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const writeJson = (file, data) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
const label = (version) => `v${Number.parseInt(version, 10)}`;

const rootPkg = readJson(files.root);
const desktopPkg = readJson(files.desktop);
const current = rootPkg.version;
const next = flag("no-bump") || flag("skip-build") ? current : `${Number.parseInt(current, 10) + 1}.0.0`;

const updateUrl = option("update-url");
if (updateUrl) {
  if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(updateUrl)) {
    console.error("--update-url must start with https:// (or http://localhost for testing).");
    process.exit(1);
  }
  desktopPkg.updateUrl = updateUrl.replace(/\/+$/, "");
}

function setVersion(version) {
  writeJson(files.root, { ...rootPkg, version });
  writeJson(files.desktop, { ...desktopPkg, version });
}

setVersion(next);
console.log(`Releasing ${label(next)} (${next})${next !== current ? `, previous ${label(current)}` : ""}`);
console.log(`Installed apps look for updates at ${desktopPkg.updateUrl}`);

if (!flag("skip-build")) {
  const build = spawnSync("npm run desktop:build", { cwd: root, stdio: "inherit", shell: true });
  if (build.status !== 0) {
    setVersion(current);
    console.error(`Build failed; version reset to ${label(current)}.`);
    process.exit(build.status ?? 1);
  }
}

const installerName = `${desktopPkg.productName} Setup ${next}.exe`;
const installer = path.join(root, "dist-desktop", installerName);
if (!existsSync(installer)) {
  console.error(`Installer not found: ${installer}`);
  process.exit(1);
}

const outDir = path.resolve(option("out") || process.env.UPDATES_DIR || path.join(root, "portal", "updates"));
mkdirSync(outDir, { recursive: true });
copyFileSync(installer, path.join(outDir, installerName));

const sha512 = createHash("sha512").update(readFileSync(installer)).digest("base64");
const release = {
  version: next,
  file: installerName,
  sha512,
  size: statSync(installer).size,
  notes: option("notes") ?? "",
  releasedAt: new Date().toISOString(),
};
writeFileSync(path.join(outDir, "latest.json"), `${JSON.stringify(release, null, 2)}\n`);

const old = readdirSync(outDir)
  .filter((f) => f.endsWith(".exe") && f !== installerName)
  .sort((a, b) => statSync(path.join(outDir, b)).mtimeMs - statSync(path.join(outDir, a)).mtimeMs)
  .slice(KEEP_INSTALLERS - 1);
for (const f of old) rmSync(path.join(outDir, f), { force: true });

console.log(`\nPublished ${label(next)} to ${outDir}`);
console.log(`  ${installerName} (${(release.size / 1024 / 1024).toFixed(1)} MB)`);
console.log("  latest.json");
console.log("Installed apps pick it up within a few hours, or right away via Help > Check for updates.");
