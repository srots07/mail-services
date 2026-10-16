import { execSync } from "node:child_process";

console.log("[netlify-build] Step 1: Generating Prisma client...");
execSync("npx prisma generate", { stdio: "inherit" });

const FALLBACK_DB_URL = "postgresql://postgres.jnbkujuekofcabqzdksk:UAdMSkZhHjlOhw2m@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require";
let dbUrl = process.env.DATABASE_URL?.trim() || "";
if ((dbUrl.startsWith('"') && dbUrl.endsWith('"')) || (dbUrl.startsWith("'") && dbUrl.endsWith("'"))) {
  dbUrl = dbUrl.slice(1, -1).trim();
}
if (dbUrl.startsWith("DATABASE_URL=")) {
  dbUrl = dbUrl.slice("DATABASE_URL=".length).trim();
}
if (!dbUrl.startsWith("postgres")) {
  dbUrl = FALLBACK_DB_URL;
}
process.env.DATABASE_URL = dbUrl;

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
