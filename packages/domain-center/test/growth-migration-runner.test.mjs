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
import {growthMigrationStatus,growthMigrationStatusError} from "../bin/growth-migration-status.mjs";

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

test("growth migration inspection is read-only and fail closed on drift",async()=>{const fixturePath=fileURLToPath(new URL("./fixtures/999_growth_checksum_fixture.up.sql",import.meta.url)),calls=[],client={async query(sql){calls.push(sql);return{rows:[{name:"999_growth_checksum_fixture.up.sql",checksum:"0".repeat(64)}]};}},drift=await inspectGrowthMigrations(client,[fixturePath]);assert.equal(drift.status,"BLOCKED");assert.deepEqual(drift.summary,{total:1,applied:0,pending:0,drift:1,legacyChecksumMissing:0,unexpectedApplied:0,invalidLedgerEntries:0,ledgerLimitExceeded:false});assert.match(calls[0],/LIMIT 1001$/);assert.equal(calls.length,1);const pending=await inspectGrowthMigrations({async query(){return{rows:[]};}},[fixturePath]);assert.equal(pending.status,"PENDING");assert.equal(pending.items[0].actualChecksum,null);});

test("growth migration inspection blocks ledger entries absent from the manifest",async()=>{const fixturePath=fileURLToPath(new URL("./fixtures/999_growth_checksum_fixture.up.sql",import.meta.url)),report=await inspectGrowthMigrations({async query(){return{rows:[{name:"removed_growth_migration.up.sql",checksum:"a".repeat(64)}]};}},[fixturePath]);assert.equal(report.status,"BLOCKED");assert.equal(report.summary.unexpectedApplied,1);assert.deepEqual(report.items.at(-1),{name:"removed_growth_migration.up.sql",status:"UNEXPECTED_APPLIED",expectedChecksum:null,actualChecksum:"a".repeat(64)});});

test("growth migration inspection bounds and sanitizes malformed ledger data",async()=>{const fixturePath=fileURLToPath(new URL("./fixtures/999_growth_checksum_fixture.up.sql",import.meta.url)),rows=Array.from({length:1001},(_,index)=>({name:index===0?'token=secret':`unexpected_${index}.up.sql`,checksum:'a'.repeat(64)})),report=await inspectGrowthMigrations({async query(){return{rows};}},[fixturePath]);assert.equal(report.status,"BLOCKED");assert.equal(report.summary.invalidLedgerEntries,1);assert.equal(report.summary.ledgerLimitExceeded,true);assert.equal(report.items.some(item=>JSON.stringify(item).includes('token=secret')),false);assert.equal(report.items.at(-1).status,'LEDGER_LIMIT_EXCEEDED');});

test("growth migration status command stays read-only with an injected pool",async()=>{let calls=0;const report=await growthMigrationStatus({pool:{async query(sql){calls+=1;assert.match(sql,/^SELECT name,checksum/);return{rows:[]};}}});assert.equal(report.schemaVersion,1);assert.equal(report.status,"PENDING");assert.equal(report.summary.total,growthMigrationPaths.length);assert.deepEqual(report.safety,{readOnly:true,ddlExecuted:false,migrationsApplied:false,credentialsReturned:false});assert.equal(calls,1);});

test("growth migration status errors are versioned and sanitized",()=>{assert.equal(growthMigrationStatusError(Object.assign(new Error('safe'),{code:'42P01'})).code,'42P01');const report=growthMigrationStatusError(new Error('password=database-secret at remote host'));assert.equal(report.schemaVersion,1);assert.equal(report.code,'GROWTH_MIGRATION_STATUS_FAILED');assert.equal(report.safety.readOnly,true);assert.doesNotMatch(JSON.stringify(report),/database-secret|remote host/);});

test("strict growth migration apply blocks unexpected ledger entries",async()=>{await ensurePostgresFixture();const pool=createTestPool(),client=await pool.connect(),name='997_removed_growth_migration.up.sql';try{await withGrowthMigrationLock(client,()=>applyGrowthMigrations(client,growthMigrationPaths,{strictManifest:true}));await client.query('INSERT INTO growth_schema_migration(name,checksum) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET checksum=EXCLUDED.checksum',[name,'a'.repeat(64)]);await assert.rejects(()=>withGrowthMigrationLock(client,()=>applyGrowthMigrations(client,growthMigrationPaths,{strictManifest:true})),error=>error.code==='GROWTH_SCHEMA_MIGRATION_MANIFEST_BLOCKED'&&error.summary.unexpectedApplied===1);}finally{await client.query('DELETE FROM growth_schema_migration WHERE name=$1',[name]).catch(()=>{});client.release();await pool.end();}});

test("growth migration lock wait is bounded when another session owns it",async()=>{let operationCalls=0,unlockCalls=0;const client={async query(sql){if(sql.startsWith('SELECT pg_try_advisory_lock'))return{rows:[{acquired:false}]};if(sql.startsWith('SELECT pg_advisory_unlock'))unlockCalls+=1;return{rows:[]};}};await assert.rejects(()=>withGrowthMigrationLock(client,async()=>{operationCalls+=1;},{waitMs:0}),error=>error.code==='GROWTH_SCHEMA_MIGRATION_LOCK_BUSY'&&error.retryable===true);await assert.rejects(()=>withGrowthMigrationLock(client,async()=>{}, {waitMs:30001}),/LOCK_WAIT_INVALID/);assert.equal(operationCalls,0);assert.equal(unlockCalls,0);});
