import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {readdir,access} from "node:fs/promises";
import {basename,resolve} from "node:path";
import {
  ensurePostgresFixture,
  createTestPool,
} from "../../orchestrator-core/lib/postgres-fixture.mjs";
import {
  applyGrowthMigrations,
  inspectGrowthMigrations,
  withGrowthMigrationLock,
} from "../lib/growth-migration-runner.mjs";
import {growthMigrationPaths} from "../lib/growth-database.mjs";

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

test("growth migration manifest is ordered complete and rollback-reviewed",async()=>{const directory=resolve(process.cwd(),"packages/orchestrator-core/migrations"),files=await readdir(directory),growthUps=files.filter(name=>/^\d+_growth_.*\.up\.sql$/.test(name)).sort(),manifest=growthMigrationPaths.map(path=>basename(path)),growthManifest=manifest.filter(name=>/^\d+_growth_/.test(name));assert.deepEqual(growthManifest,growthUps);assert.ok(manifest.includes("020_business_source_approval_sequence.up.sql"));assert.equal(new Set(manifest).size,manifest.length);const numbers=manifest.map(name=>Number(name.slice(0,3)));assert.deepEqual(numbers,[...numbers].sort((a,b)=>a-b));const irreversibleBaseline=new Set(["012_growth_platform.up.sql","013_growth_score_history.up.sql","014_growth_delivery_ledger.up.sql","015_growth_delivery_audit.up.sql","016_growth_identity_review.up.sql","017_growth_connector_binding.up.sql"]);for(const name of growthUps){const down=resolve(directory,name.replace(/\.up\.sql$/,".down.sql"));if(irreversibleBaseline.has(name))await assert.rejects(()=>access(down));else await access(down);}});

test("growth migration inspection is read-only and fail closed on drift",async()=>{const fixturePath=fileURLToPath(new URL("./fixtures/999_growth_checksum_fixture.up.sql",import.meta.url)),calls=[],client={async query(sql){calls.push(sql);return{rows:[{name:"999_growth_checksum_fixture.up.sql",checksum:"0".repeat(64)}]};}},drift=await inspectGrowthMigrations(client,[fixturePath]);assert.equal(drift.status,"BLOCKED");assert.deepEqual(drift.summary,{total:1,applied:0,pending:0,drift:1,legacyChecksumMissing:0});assert.equal(calls.length,1);const pending=await inspectGrowthMigrations({async query(){return{rows:[]};}},[fixturePath]);assert.equal(pending.status,"PENDING");assert.equal(pending.items[0].actualChecksum,null);});
