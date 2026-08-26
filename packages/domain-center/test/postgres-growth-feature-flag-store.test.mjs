import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ensurePostgresFixture, createTestPool } from "../../orchestrator-core/lib/postgres-fixture.mjs";
import { migrateGrowthPlatform } from "../lib/growth-database.mjs";
import { PostgresGrowthFeatureFlagStore } from "../lib/postgres-growth-feature-flag-store.mjs";

test("growth production feature flag is tenant scoped, expiring, CAS and audited", async () => {
  await ensurePostgresFixture();
  const pool = createTestPool(), suffix = randomUUID(), scope = { organizationId: `feature-${suffix}`, workspaceId: "growth", tenantId: "tenant-a" };
  let now = new Date("2026-08-26T10:00:00Z");
  try {
    await migrateGrowthPlatform(pool);
    const store = new PostgresGrowthFeatureFlagStore({ pool, clock: () => now });
    assert.equal((await store.readiness(scope)).status, "NOT_CONFIGURED");
    await assert.rejects(() => store.set({ scope, enabled: true, expiresAt: "2026-08-27T10:00:00Z", actorId: "prod-operator" }), (error) => error.code === "GROWTH_FEATURE_FLAG_AUTHORIZATION_REQUIRED");
    const enabled = await store.set({ scope, enabled: true, authorizationReferenceId: "PROD-AUTH-FLAG-001", expiresAt: "2026-08-27T10:00:00Z", actorId: "prod-operator" });
    assert.equal((await store.readiness(scope)).enabled, true);
    assert.equal((await store.readiness({ ...scope, tenantId: "tenant-b" })).enabled, false);
    await assert.rejects(() => store.set({ scope, enabled: false, expectedVersion: enabled.version - 1, actorId: "prod-operator" }), (error) => error.code === "GROWTH_FEATURE_FLAG_VERSION_CONFLICT");
    now = new Date("2026-08-27T10:00:01Z");
    assert.equal((await store.readiness(scope)).enabled, false);
    const disabled = await store.set({ scope, enabled: false, expectedVersion: enabled.version, actorId: "prod-operator" });
    assert.equal(disabled.enabled, false);
    const events = (await pool.query("SELECT enabled,authorization_reference_hash FROM growth_tenant_feature_flag_event WHERE organization_id=$1 ORDER BY sequence_id", [scope.organizationId])).rows;
    assert.equal(events.length, 2);
    assert.match(events[0].authorization_reference_hash, /^[a-f0-9]{64}$/);
    assert.equal(events[1].authorization_reference_hash, null);
    assert.doesNotMatch(JSON.stringify(await store.readiness(scope)) + JSON.stringify(events), /PROD-AUTH-FLAG-001/);
  } finally {
    await pool.query("DELETE FROM growth_tenant_feature_flag WHERE organization_id=$1", [scope.organizationId]).catch(() => {});
    await pool.end();
  }
});
