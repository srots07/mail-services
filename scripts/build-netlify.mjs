import { execSync } from "node:child_process";

console.log("[netlify-build] Step 1: Generating Prisma client...");
execSync("npx prisma generate", { stdio: "inherit" });

const rawUrl = process.env.DATABASE_URL?.trim() || "";
let dbUrl = rawUrl;
if ((dbUrl.startsWith('"') && dbUrl.endsWith('"')) || (dbUrl.startsWith("'") && dbUrl.endsWith("'"))) {
  dbUrl = dbUrl.slice(1, -1).trim();
}
if (dbUrl.startsWith("DATABASE_URL=")) {
  dbUrl = dbUrl.slice("DATABASE_URL=".length).trim();
}
// No hardcoded fallback: DATABASE_URL must be set in Netlify UI environment variables.
if (dbUrl) {
  process.env.DATABASE_URL = dbUrl;
}

if (dbUrl !== "") {
  console.log("[netlify-build] Step 2: DATABASE_URL detected. Syncing schema to cloud database...");
  try {
    execSync("npx prisma db push --accept-data-loss", { stdio: "inherit" });
    console.log("[netlify-build] Database schema synchronized successfully.");
  } catch (err) {
    console.warn("[netlify-build] Warning: Prisma db push failed, continuing build:", err.message);
  }
} else {
  console.log("[netlify-build] Step 2: DATABASE_URL not set in build environment. Skipping schema push.");
}

console.log("[netlify-build] Step 3: Building Next.js application...");
execSync("npx next build", { stdio: "inherit" });
