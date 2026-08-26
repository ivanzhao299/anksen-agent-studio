import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PostgresGrowthStore } from './postgres-growth-store.mjs';
import { assertBusinessDatabaseUrl, resolveBusinessDatabaseUrl } from './business-database.mjs';

const { Pool } = pg;
const migrationPaths = [
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/012_growth_platform.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/013_growth_score_history.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/014_growth_delivery_ledger.up.sql', import.meta.url))),
  resolve(fileURLToPath(new URL('../../orchestrator-core/migrations/015_growth_delivery_audit.up.sql', import.meta.url))),
];

export async function migrateGrowthPlatform(pool) {
  if (!pool) throw new Error('pool is required');
  for (const migrationPath of migrationPaths) await pool.query(await readFile(migrationPath, 'utf8'));
  return true;
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
