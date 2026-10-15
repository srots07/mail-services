// Builds the Next.js app as a self-contained server for the desktop app:
// .next-desktop/standalone (+ static assets and public/) copied to desktop/app-server.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, ".next-desktop");
const standalone = path.join(dist, "standalone");
const out = path.join(root, "desktop", "app-server");

console.log("Building Next.js (standalone)...");
const build = spawnSync("npx next build", {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_OUTPUT_STANDALONE: "1", NODE_ENV: "production" },
});
if (build.status !== 0) process.exit(build.status ?? 1);

if (!existsSync(path.join(standalone, "server.js"))) {
  console.error(`server.js not found in ${standalone}. Check outputFileTracingRoot.`);
  process.exit(1);
}

cpSync(path.join(dist, "static"), path.join(standalone, ".next-desktop", "static"), { recursive: true });
if (existsSync(path.join(root, "public"))) cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });

rmSync(out, { recursive: true, force: true });
cpSync(standalone, out, {
  recursive: true,
  dereference: true,
  // Never ship the developer's .env (keys, database URL); the desktop shell passes its own env.
  filter: (src) => !/^\.env/.test(path.basename(src)),
});
console.log(`Desktop server ready in ${path.relative(root, out)}`);

// Subscription settings baked into the shell: the website address and the license public key (not secret).
const envFile = path.join(root, ".env");
const fileEnv = existsSync(envFile) ? dotenv.parse(readFileSync(envFile)) : {};
const portalUrl = (process.env.PORTAL_URL ?? fileEnv.PORTAL_URL ?? "").replace(/\/+$/, "");
const publicKey = (process.env.LICENSE_PUBLIC_KEY ?? fileEnv.LICENSE_PUBLIC_KEY ?? "").trim();
writeFileSync(path.join(root, "desktop", "license-config.json"), JSON.stringify({ portalUrl, publicKey }, null, 2));
console.log(portalUrl && publicKey ? `Subscriptions on: ${portalUrl}` : "Subscriptions off (PORTAL_URL / LICENSE_PUBLIC_KEY not set): sending is not restricted.");
