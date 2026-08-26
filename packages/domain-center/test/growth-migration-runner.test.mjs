import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  ensurePostgresFixture,
  createTestPool,
} from "../../orchestrator-core/lib/postgres-fixture.mjs";
import {
  applyGrowthMigrations,
  withGrowthMigrationLock,
} from "../lib/growth-migration-runner.mjs";

test("growth migration ledger records checksums and rejects drift", async () => {
  await ensurePostgresFixture();
  const pool = createTestPool(),
    client = await pool.connect(),
    fixturePath = fileURLToPath(
      new URL("./fixtures/999_growth_checksum_fixture.up.sql", import.meta.url),
    );
  try {
    await withGrowthMigrationLock(client, async () => {
      await applyGrowthMigrations(client, [fixturePath]);
      const stored = (
        await client.query(
          "SELECT checksum FROM growth_schema_migration WHERE name=$1",
          ["999_growth_checksum_fixture.up.sql"],
        )
      ).rows[0];
      assert.match(stored.checksum, /^[0-9a-f]{64}$/);
      await applyGrowthMigrations(client, [fixturePath]);
      await client.query(
        "UPDATE growth_schema_migration SET checksum=$2 WHERE name=$1",
        ["999_growth_checksum_fixture.up.sql", "0".repeat(64)],
      );
      await assert.rejects(
        () => applyGrowthMigrations(client, [fixturePath]),
        (error) =>
          error.code === "GROWTH_SCHEMA_MIGRATION_CHECKSUM_MISMATCH" &&
          error.migration === "999_growth_checksum_fixture.up.sql",
      );
    });
  } finally {
    await client
      .query("DELETE FROM growth_schema_migration WHERE name=$1", [
        "999_growth_checksum_fixture.up.sql",
      ])
      .catch(() => {});
    client.release();
    await pool.end();
  }
});

test("growth migration rolls back schema when ledger persistence fails",async()=>{await ensurePostgresFixture();const pool=createTestPool(),client=await pool.connect(),fixturePath=fileURLToPath(new URL("./fixtures/998_growth_atomic_fixture.up.sql",import.meta.url)),proxy={async query(sql,values){if(String(sql).startsWith("INSERT INTO growth_schema_migration")&&values?.[0]==="998_growth_atomic_fixture.up.sql")throw Object.assign(new Error("injected ledger failure"),{code:"INJECTED_LEDGER_FAILURE"});return client.query(sql,values);}};try{await assert.rejects(()=>withGrowthMigrationLock(proxy,()=>applyGrowthMigrations(proxy,[fixturePath])),error=>error.code==="INJECTED_LEDGER_FAILURE");assert.equal((await client.query("SELECT to_regclass('growth_atomic_migration_fixture') name")).rows[0].name,null);assert.equal(Number((await client.query("SELECT count(*) count FROM growth_schema_migration WHERE name='998_growth_atomic_fixture.up.sql'")).rows[0].count),0);}finally{await client.query("DROP TABLE IF EXISTS growth_atomic_migration_fixture").catch(()=>{});client.release();await pool.end();}});
