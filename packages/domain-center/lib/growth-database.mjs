import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PostgresGrowthStore } from './postgres-growth-store.mjs';
import { assertBusinessDatabaseUrl, resolveBusinessDatabaseUrl } from './business-database.mjs';
import { applyGrowthMigrations, withGrowthMigrationLock } from './growth-migration-runner.mjs';

const { Pool } = pg;
const migrationPaths = [
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/012_growth_platform.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/013_growth_score_history.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/014_growth_delivery_ledger.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/015_growth_delivery_audit.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/016_growth_identity_review.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/017_growth_connector_binding.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/018_growth_source_approval_scope.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/019_growth_tenant_feature_flag.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/020_business_source_approval_sequence.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/021_growth_feature_flag_event_immutable.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/022_growth_audit_streams_immutable.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/023_growth_delivery_reference_constraints.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/024_growth_delivery_external_reference_constraints.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/025_growth_feature_flag_constraints.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/026_growth_delivery_operation_constraints.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/027_growth_identity_review_reason_constraints.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/028_growth_tenant_relational_integrity.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/029_growth_identity_constraints.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/030_growth_tenant_scope_constraints.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/031_growth_event_constraints.up.sql', import.meta.url))),
];

export async function migrateGrowthPlatform(pool) {
  if (!pool) throw new Error('pool is required');
  const client=typeof pool.connect==='function'?await pool.connect():pool,release=client!==pool&&typeof client.release==='function';
  try{
    await withGrowthMigrationLock(client, () =>
      applyGrowthMigrations(client, migrationPaths),
    );
    return true;
  }catch(error){throw error;}finally{if(release)client.release();}
}

export async function createGrowthDatabaseRuntime({ env = process.env, pool = null } = {}) {
  const ownsPool = !pool;
  const configured = pool ? null : resolveBusinessDatabaseUrl(env);
  if (!pool && !configured) throw new Error('BUSINESS_DATABASE_URL_REQUIRED');
  const db = pool ?? new Pool({
    connectionString: assertBusinessDatabaseUrl(configured, { allowRemote: env.BUSINESS_DATABASE_ALLOW_REMOTE === 'true' }),
    max: Number(env.BUSINESS_DATABASE_POOL_MAX ?? 10),
    application_name: 'anksen-growth-platform',
  });
  try {
    await migrateGrowthPlatform(db);
    return { backend: 'POSTGRESQL', pool: db, ownsPool, store: new PostgresGrowthStore({ pool: db }) };
  } catch (error) {
    if (ownsPool) await db.end().catch(() => {});
    throw error;
  }
}
