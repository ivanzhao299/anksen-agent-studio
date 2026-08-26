import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { BusinessApplicationStore } from "./business-application-store.mjs";
import { PostgresBusinessApplicationStore } from "./postgres-business-application-store.mjs";
import { PostgresBusinessDataConnectorStore } from "./postgres-business-data-connector.mjs";
import { PostgresBusinessSourceGovernance } from "./postgres-business-source-governance.mjs";
import { migrate } from "../../orchestrator-core/lib/persistent-night-shift.mjs";

const { Pool } = pg;
const businessMigration = resolve(fileURLToPath(new URL("../../orchestrator-core/migrations/004_business_applications.up.sql", import.meta.url)));
const businessApprovalMigration = resolve(fileURLToPath(new URL("../../orchestrator-core/migrations/005_business_approvals.up.sql", import.meta.url)));
const businessWorkControlMigration = resolve(fileURLToPath(new URL("../../orchestrator-core/migrations/006_business_work_control.up.sql", import.meta.url)));
const businessRecordRelationsMigration = resolve(fileURLToPath(new URL("../../orchestrator-core/migrations/007_business_record_relations.up.sql", import.meta.url)));
const businessRunnerNodesMigration = resolve(fileURLToPath(new URL("../../orchestrator-core/migrations/008_business_runner_nodes.up.sql", import.meta.url)));
const businessWorkResultsMigration = resolve(fileURLToPath(new URL("../../orchestrator-core/migrations/009_business_work_results.up.sql", import.meta.url)));
const businessDataConnectorsMigration = resolve(fileURLToPath(new URL("../../orchestrator-core/migrations/010_business_data_connectors.up.sql", import.meta.url)));
const businessSourceGovernanceMigration = resolve(fileURLToPath(new URL("../../orchestrator-core/migrations/011_business_source_governance.up.sql", import.meta.url)));
const growthSourceApprovalScopeMigration = resolve(fileURLToPath(new URL("../../orchestrator-core/migrations/018_growth_source_approval_scope.up.sql", import.meta.url)));
const growthTenantFeatureFlagMigration = resolve(fileURLToPath(new URL("../../orchestrator-core/migrations/019_growth_tenant_feature_flag.up.sql", import.meta.url)));
const businessSourceApprovalSequenceMigration = resolve(fileURLToPath(new URL("../../orchestrator-core/migrations/020_business_source_approval_sequence.up.sql", import.meta.url)));
const growthFeatureFlagEventImmutableMigration = resolve(fileURLToPath(new URL("../../orchestrator-core/migrations/021_growth_feature_flag_event_immutable.up.sql", import.meta.url)));
export const defaultBusinessDatabaseUrlFile = "/opt/anksen/business-data/database-url";

export function resolveBusinessDatabaseUrl(env = process.env) {
  if (env.BUSINESS_DATABASE_URL) return String(env.BUSINESS_DATABASE_URL).trim();
  const path = String(env.BUSINESS_DATABASE_URL_FILE ?? defaultBusinessDatabaseUrlFile);
  return existsSync(path) ? readFileSync(path, "utf8").trim() : null;
}

export function assertBusinessDatabaseUrl(value, { allowRemote = false } = {}) {
  if (!value) throw new Error("BUSINESS_DATABASE_URL_REQUIRED");
  const url = new URL(value);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") throw new Error("BUSINESS_DATABASE_PROTOCOL_DENIED");
  if (!allowRemote && !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("BUSINESS_DATABASE_REMOTE_DENIED");
  if (!/(business|test|fixture)/i.test(url.pathname)) throw new Error("BUSINESS_DATABASE_NAME_DENIED");
  if (!url.username || !url.password) throw new Error("BUSINESS_DATABASE_CREDENTIAL_REQUIRED");
  return value;
}

export async function createBusinessApplicationRuntime({ repoRoot, env = process.env, pool = null, requirePostgres = env.BUSINESS_DATABASE_REQUIRED === "true" } = {}) {
  const configuredUrl = pool ? null : resolveBusinessDatabaseUrl(env);
  if (!pool && !configuredUrl) {
    if (requirePostgres) throw new Error("BUSINESS_DATABASE_REQUIRED");
    return { backend: "FILE_FALLBACK", pool: null, ownsPool: false, store: new BusinessApplicationStore({ repoRoot }), connectorStore: null, sourceGovernance: null };
  }
  const databasePool = pool ?? new Pool({ connectionString: assertBusinessDatabaseUrl(configuredUrl, { allowRemote: env.BUSINESS_DATABASE_ALLOW_REMOTE === "true" }), max: Number(env.BUSINESS_DATABASE_POOL_MAX ?? 10), application_name: "anksen-studio-business" });
  try {
    const state = (await databasePool.query("SELECT to_regclass('ad_goal') kernel, to_regclass('business_application_record') business")).rows[0];
    if (!state.kernel) await migrate(databasePool, "up");
    const client = await databasePool.connect();
    try {
      await client.query("SELECT pg_advisory_lock($1)", [16012027]);
      await client.query(await readFile(businessMigration, "utf8"));
      await client.query(await readFile(businessApprovalMigration, "utf8"));
      await client.query(await readFile(businessWorkControlMigration, "utf8"));
      await client.query(await readFile(businessRecordRelationsMigration, "utf8"));
      await client.query(await readFile(businessRunnerNodesMigration, "utf8"));
      await client.query(await readFile(businessWorkResultsMigration, "utf8"));
      await client.query(await readFile(businessDataConnectorsMigration, "utf8"));
      await client.query(await readFile(businessSourceGovernanceMigration, "utf8"));
      await client.query("CREATE TABLE IF NOT EXISTS growth_schema_migration(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())");
      for (const migrationPath of [growthSourceApprovalScopeMigration, growthTenantFeatureFlagMigration, businessSourceApprovalSequenceMigration, growthFeatureFlagEventImmutableMigration]) {
        const name = migrationPath.split("/").at(-1), applied = (await client.query("SELECT 1 FROM growth_schema_migration WHERE name=$1", [name])).rowCount === 1;
        if (!applied) {
          await client.query(await readFile(migrationPath, "utf8"));
          await client.query("INSERT INTO growth_schema_migration(name) VALUES($1) ON CONFLICT DO NOTHING", [name]);
        }
      }
    } catch (error) {
      throw error;
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [16012027]).catch(() => {});
      client.release();
    }
    return { backend: "POSTGRESQL", pool: databasePool, ownsPool: !pool, store: new PostgresBusinessApplicationStore({ pool: databasePool }), connectorStore: new PostgresBusinessDataConnectorStore({ pool: databasePool }), sourceGovernance: new PostgresBusinessSourceGovernance({ pool: databasePool }) };
  } catch (error) {
    if (!pool) await databasePool.end().catch(() => {});
    throw error;
  }
}

const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? "")) ? value : null;
export async function importLegacyBusinessApplicationFile({ pool, storePath, organizationId = "studio-org", workspaceId = "studio-workspace" }) {
  if (!existsSync(storePath)) return { status: "NO_LEGACY_FILE", records: 0, workItems: 0, relations: 0, events: 0 };
  const data = JSON.parse(await readFile(storePath, "utf8")), client = await pool.connect();
  const imported = { status: "IMPORTED", records: 0, workItems: 0, relations: 0, events: 0 };
  try {
    await client.query("BEGIN");
    for (const record of data.records ?? []) {
      const result = await client.query("INSERT INTO business_application_record(id,organization_id,workspace_id,application_id,object_type,display_key,title,status,owner_id,fields,source,version,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'MIGRATED_FILE_STORE',$11,$12,$13,$14) ON CONFLICT DO NOTHING", [record.id, record.organizationId ?? organizationId, record.workspaceId ?? workspaceId, record.applicationId, record.objectType, record.displayKey, record.title, record.status, record.ownerId, record.fields ?? {}, record.version ?? 1, record.createdBy ?? "legacy", record.createdAt ?? new Date(), record.updatedAt ?? record.createdAt ?? new Date()]);
      imported.records += result.rowCount;
    }
    for (const item of data.workItems ?? []) {
      if (!uuid(item.businessObject?.objectId)) continue;
      const result = await client.query("INSERT INTO business_work_item(id,organization_id,workspace_id,application_id,business_record_id,business_object_type,business_display_key,business_object_version,title,status,assignment_type,assignee_id,delegated_by,priority,idempotency_key,kernel_task_id,kernel_goal_id,session_id,result_ref,created_at,updated_at) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21 WHERE EXISTS(SELECT 1 FROM business_application_record WHERE id=$5) ON CONFLICT DO NOTHING", [item.id, item.organizationId ?? organizationId, item.workspaceId ?? workspaceId, item.applicationId, item.businessObject.objectId, item.businessObject.objectType, item.businessObject.displayKey, item.businessObject.version ?? 1, item.title, item.status, item.assignmentType, item.assigneeId, item.delegatedBy, item.priority ?? "MEDIUM", item.idempotencyKey ?? `legacy:${item.id}`, uuid(item.kernelTaskId), uuid(item.kernelGoalId), uuid(item.sessionId), item.resultRef ?? null, item.createdAt ?? new Date(), item.updatedAt ?? item.createdAt ?? new Date()]);
      imported.workItems += result.rowCount;
    }
    for(const relation of data.relations??[]){
      const result=await client.query("INSERT INTO business_record_relation(id,organization_id,workspace_id,application_id,source_record_id,target_record_id,relation_type,created_by,created_at) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9 WHERE EXISTS(SELECT 1 FROM business_application_record WHERE id=$5) AND EXISTS(SELECT 1 FROM business_application_record WHERE id=$6) ON CONFLICT DO NOTHING",[relation.id,relation.organizationId??organizationId,relation.workspaceId??workspaceId,relation.applicationId,relation.sourceRecordId,relation.targetRecordId,relation.relationType,relation.createdBy??"legacy",relation.createdAt??new Date()]);
      imported.relations+=result.rowCount;
    }
    for (const event of data.events ?? []) {
      const result = await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,work_item_id,actor_id,payload,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING", [uuid(event.id) ?? randomUUID(), event.organizationId ?? organizationId, event.workspaceId ?? workspaceId, event.type ?? "business.legacy.event", event.applicationId, event.objectType ?? null, uuid(event.objectId), event.objectVersion ?? null, uuid(event.workItemId), event.actorId ?? "legacy", event, event.at ?? new Date()]);
      imported.events += result.rowCount;
    }
    await client.query("COMMIT");
    return imported;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
