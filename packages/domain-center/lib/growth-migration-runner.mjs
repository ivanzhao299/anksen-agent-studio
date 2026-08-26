import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const checksum = (sql) => createHash("sha256").update(sql).digest("hex");

export async function inspectGrowthMigrations(client,migrationPaths){if(!client?.query)throw new TypeError("client is required");let rows;try{rows=(await client.query("SELECT name,checksum FROM growth_schema_migration ORDER BY name LIMIT 1001")).rows;}catch(error){if(error?.code!=="42P01")throw error;rows=[];}const ledgerLimitExceeded=rows.length>1000,validRows=[],items=[];for(const row of rows.slice(0,1000)){if(typeof row.name!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(row.name)||(row.checksum!==null&&(typeof row.checksum!=="string"||!/^[0-9a-f]{64}$/.test(row.checksum))))items.push({name:null,status:"INVALID_LEDGER_ENTRY",expectedChecksum:null,actualChecksum:null});else validRows.push(row);}const byName=new Map(validRows.map(row=>[row.name,row.checksum])),manifestNames=new Set();for(const migrationPath of migrationPaths){const name=basename(migrationPath),sql=await readFile(migrationPath,"utf8"),expectedChecksum=checksum(sql),actualChecksum=byName.get(name),status=!byName.has(name)?"PENDING":!actualChecksum?"LEGACY_CHECKSUM_MISSING":actualChecksum===expectedChecksum?"APPLIED":"DRIFT";manifestNames.add(name);items.push({name,status,expectedChecksum,actualChecksum:actualChecksum??null});}for(const row of validRows){if(!manifestNames.has(row.name))items.push({name:row.name,status:"UNEXPECTED_APPLIED",expectedChecksum:null,actualChecksum:row.checksum??null});}if(ledgerLimitExceeded)items.push({name:null,status:"LEDGER_LIMIT_EXCEEDED",expectedChecksum:null,actualChecksum:null});const summary={total:manifestNames.size,applied:items.filter(item=>item.status==="APPLIED").length,pending:items.filter(item=>item.status==="PENDING").length,drift:items.filter(item=>item.status==="DRIFT").length,legacyChecksumMissing:items.filter(item=>item.status==="LEGACY_CHECKSUM_MISSING").length,unexpectedApplied:items.filter(item=>item.status==="UNEXPECTED_APPLIED").length,invalidLedgerEntries:items.filter(item=>item.status==="INVALID_LEDGER_ENTRY").length,ledgerLimitExceeded};return{status:summary.drift||summary.legacyChecksumMissing||summary.unexpectedApplied||summary.invalidLedgerEntries||summary.ledgerLimitExceeded?"BLOCKED":summary.pending?"PENDING":"READY",summary,items};}

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
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO growth_schema_migration(name,checksum) VALUES($1,$2)",
        [name, expectedChecksum],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
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
