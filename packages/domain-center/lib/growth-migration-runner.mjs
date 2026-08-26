import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const checksum = (sql) => createHash("sha256").update(sql).digest("hex");

export async function applyGrowthMigrations(client, migrationPaths) {
  await client.query(
    "CREATE TABLE IF NOT EXISTS growth_schema_migration(name text PRIMARY KEY,checksum text,applied_at timestamptz NOT NULL DEFAULT now())",
  );
  await client.query(
    "ALTER TABLE growth_schema_migration ADD COLUMN IF NOT EXISTS checksum text",
  );
  await client.query(
    "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_schema_migration'::regclass AND conname='growth_schema_migration_checksum_valid') THEN ALTER TABLE growth_schema_migration ADD CONSTRAINT growth_schema_migration_checksum_valid CHECK (checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$'); END IF; END $$",
  );
  for (const migrationPath of migrationPaths) {
    const name = basename(migrationPath),
      sql = await readFile(migrationPath, "utf8"),
      expectedChecksum = checksum(sql),
      existing = (
        await client.query(
          "SELECT checksum FROM growth_schema_migration WHERE name=$1",
          [name],
        )
      ).rows[0];
    if (existing) {
      if (existing.checksum && existing.checksum !== expectedChecksum) {
        const error = new Error("GROWTH_SCHEMA_MIGRATION_CHECKSUM_MISMATCH");
        error.code = "GROWTH_SCHEMA_MIGRATION_CHECKSUM_MISMATCH";
        error.migration = name;
        throw error;
      }
      if (!existing.checksum)
        await client.query(
          "UPDATE growth_schema_migration SET checksum=$2 WHERE name=$1 AND checksum IS NULL",
          [name, expectedChecksum],
        );
      continue;
    }
    await client.query(sql);
    await client.query(
      "INSERT INTO growth_schema_migration(name,checksum) VALUES($1,$2)",
      [name, expectedChecksum],
    );
  }
}

export async function withGrowthMigrationLock(client, operation) {
  await client.query("SELECT pg_advisory_lock($1)", [16012027]);
  try {
    return await operation();
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [16012027])
      .catch(() => {});
  }
}
