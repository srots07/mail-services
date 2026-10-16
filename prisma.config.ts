import "dotenv/config";
import { defineConfig } from "prisma/config";

function cleanUrl(url?: string): string {
  if (!url) return "";
  let clean = url.trim();
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1).trim();
  }
  if (clean.startsWith("DATABASE_URL=")) {
    clean = clean.slice("DATABASE_URL=".length).trim();
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
