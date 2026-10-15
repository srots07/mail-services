// Applies prisma/migrations/*/migration.sql in order, recording them in the same
// _prisma_migrations table Prisma uses, so `prisma migrate deploy` stays compatible.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

async function migrate(pg, connectionString, migrationsDir, log = () => {}) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(CREATE_TABLE);
    const { rows } = await client.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`);
    const applied = new Set(rows.map((r) => r.migration_name));
    const names = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(migrationsDir, d.name, "migration.sql")))
      .map((d) => d.name)
      .sort();

    for (const name of names) {
      if (applied.has(name)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      log(`Applying migration ${name}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count, started_at) VALUES ($1, $2, now(), $3, 1, now())`,
          [crypto.randomUUID(), checksum, name],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Database migration ${name} failed: ${err.message}`);
      }
    }
  } finally {
    await client.end();
  }
}

module.exports = { migrate };
