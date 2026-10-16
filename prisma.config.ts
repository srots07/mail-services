import "dotenv/config";
import { defineConfig } from "prisma/config";

const FALLBACK_DB_URL = "postgresql://postgres.jnbkujuekofcabqzdksk:UAdMSkZhHjlOhw2m@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require";

function cleanUrl(url?: string): string {
  if (!url) return FALLBACK_DB_URL;
  let clean = url.trim();
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1).trim();
  }
  if (clean.startsWith("DATABASE_URL=")) {
    clean = clean.slice("DATABASE_URL=".length).trim();
  }
  if (!clean.startsWith("postgres")) {
    return FALLBACK_DB_URL;
  }
  return clean;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: cleanUrl(process.env.DATABASE_URL),
  },
});
