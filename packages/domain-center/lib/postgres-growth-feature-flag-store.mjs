import { createHash, randomUUID } from "node:crypto";
import { assertTenantScope } from "../../growth-core/lib/domain-model.mjs";

const fail = (code) => Object.assign(new Error(code), { code });
const secretLike = (value) =>
  /(?:^sk-|^gh[pousr]_|bearer\s|password\s*=|token\s*=|api[_-]?key\s*=|-----BEGIN|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.)/i.test(
    String(value ?? ""),
  );
const safeRef = (value) =>
  typeof value === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,159}$/.test(value) &&
  !secretLike(value);
const hash = (value) =>
  createHash("sha256").update(String(value)).digest("hex");

export class PostgresGrowthFeatureFlagStore {
  constructor({
    pool,
    clock = () => new Date(),
    authorizeProductionOperation = async () => false,
  } = {}) {
    if (!pool) throw fail("GROWTH_FEATURE_FLAG_POOL_REQUIRED");
    this.pool = pool;
    this.clock = clock;
    this.authorizeProductionOperation = authorizeProductionOperation;
  }

  async readiness(scopeValue, flagKey = "GROWTH_PILOT_PRODUCTION_ENABLED") {
    const scope = assertTenantScope(scopeValue),
      row = (
        await this.pool.query(
          "SELECT id,enabled,expires_at,version FROM growth_tenant_feature_flag WHERE organization_id=$1 AND workspace_id=$2 AND tenant_id=$3 AND flag_key=$4",
          [scope.organizationId, scope.workspaceId, scope.tenantId, flagKey],
        )
      ).rows[0],
      expiresAt = row?.expires_at ? new Date(row.expires_at) : null,
      enabled =
        row?.enabled === true &&
        Boolean(expiresAt) &&
        expiresAt.getTime() > this.clock().getTime();
    return {
      flagKey,
      status: enabled ? "ENABLED" : row ? "DISABLED" : "NOT_CONFIGURED",
      enabled,
      version: row ? Number(row.version) : null,
      expiresAt: expiresAt?.toISOString() ?? null,
      source: "TENANT_SCOPED_GROWTH_FEATURE_FLAG",
      safety: {
        authorizationReferenceExposed: false,
        credentialValuesRead: false,
        externalCallsPerformed: false,
      },
    };
  }

  async set({
    scope: scopeValue,
    flagKey = "GROWTH_PILOT_PRODUCTION_ENABLED",
    enabled,
    authorizationReferenceId,
    expiresAt,
    expectedVersion,
    actorId,
  }) {
    const scope = assertTenantScope(scopeValue),
      now = this.clock(),
      expiry = expiresAt ? new Date(expiresAt) : null;
    if (!actorId) throw fail("GROWTH_FEATURE_FLAG_ACTOR_REQUIRED");
    if (
      enabled &&
      (!safeRef(authorizationReferenceId) ||
        !expiry ||
        !Number.isFinite(expiry.getTime()) ||
        expiry.getTime() <= now.getTime())
    )
      throw fail("GROWTH_FEATURE_FLAG_AUTHORIZATION_REQUIRED");
    if (
      (await this.authorizeProductionOperation({
        scope,
        actorId: String(actorId),
        operation: enabled
          ? "GROWTH_PRODUCTION_FEATURE_FLAG_ENABLE"
          : "GROWTH_PRODUCTION_FEATURE_FLAG_DISABLE",
        flagKey,
        authorizationReferenceId: enabled ? authorizationReferenceId : null,
        expectedVersion: expectedVersion ?? null,
      })) !== true
    )
      throw fail("GROWTH_FEATURE_FLAG_PRODUCTION_OPERATION_NOT_AUTHORIZED");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = (
        await client.query(
          "SELECT * FROM growth_tenant_feature_flag WHERE organization_id=$1 AND workspace_id=$2 AND tenant_id=$3 AND flag_key=$4 FOR UPDATE",
          [scope.organizationId, scope.workspaceId, scope.tenantId, flagKey],
        )
      ).rows[0];
      if (existing && Number(existing.version) !== Number(expectedVersion))
        throw fail("GROWTH_FEATURE_FLAG_VERSION_CONFLICT");
      if (!existing && expectedVersion != null)
        throw fail("GROWTH_FEATURE_FLAG_VERSION_CONFLICT");
      const id = existing?.id ?? `growth-flag-${randomUUID()}`,
        version = existing ? Number(existing.version) + 1 : 1,
        row = (
          await client.query(
            `INSERT INTO growth_tenant_feature_flag(id,organization_id,workspace_id,tenant_id,flag_key,enabled,authorization_reference_id,expires_at,version,last_actor_id,created_at,updated_at)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
             ON CONFLICT(id) DO UPDATE SET enabled=EXCLUDED.enabled,authorization_reference_id=EXCLUDED.authorization_reference_id,expires_at=EXCLUDED.expires_at,version=EXCLUDED.version,last_actor_id=EXCLUDED.last_actor_id,updated_at=EXCLUDED.updated_at
             RETURNING id,enabled,expires_at,version`,
            [
              id,
              scope.organizationId,
              scope.workspaceId,
              scope.tenantId,
              flagKey,
              Boolean(enabled),
              enabled ? authorizationReferenceId : null,
              enabled ? expiry : null,
              version,
              String(actorId),
              now,
            ],
          )
        ).rows[0];
      await client.query(
        "INSERT INTO growth_tenant_feature_flag_event(flag_id,organization_id,workspace_id,tenant_id,flag_key,enabled,flag_version,actor_id,authorization_reference_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          id,
          scope.organizationId,
          scope.workspaceId,
          scope.tenantId,
          flagKey,
          Boolean(enabled),
          version,
          String(actorId),
          enabled ? hash(authorizationReferenceId) : null,
          enabled ? expiry : null,
          now,
        ],
      );
      await client.query("COMMIT");
      return {
        id: row.id,
        enabled: row.enabled,
        version: Number(row.version),
        expiresAt: row.expires_at?.toISOString?.() ?? row.expires_at ?? null,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}
