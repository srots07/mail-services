// Development only: runs a private PostgreSQL for the portal using the binaries the desktop app bundles.
//   node scripts/local-db.mjs start   -> prints the DATABASE_URL to use
//   node scripts/local-db.mjs stop
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const { LocalPostgres } = require(path.join(root, "desktop", "postgres.cjs"));
const pg = require("pg");

export function localDb({ dataDir = path.join(here, "..", ".localdb", "data"), port = 47901 } = {}) {
  return new LocalPostgres({
    binDir: path.join(root, "node_modules", "@embedded-postgres", "windows-x64", "native", "bin"),
    dataDir,
    port,
    password: "portal-dev",
  });
}

export async function startLocalDb(options) {
  const db = localDb(options);
  await db.start();
  await db.ensureDatabase(pg);
  return db;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  if (cmd === "start") {
    const db = await startLocalDb();
    console.log(`Running. DATABASE_URL="${db.connectionString}"`);
  } else if (cmd === "stop") {
    await localDb().stop();
    console.log("Stopped.");
  } else {
    console.log("Usage: node scripts/local-db.mjs start|stop");
    process.exit(1);
  }
}
