import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createTestPool,
  ensurePostgresFixture,
} from "../../orchestrator-core/lib/postgres-fixture.mjs";
import { createBusinessApplicationRuntime } from "../lib/business-database.mjs";
import { migrateGrowthPlatform } from "../lib/growth-database.mjs";
import { PostgresBusinessSourceGovernance } from "../lib/postgres-business-source-governance.mjs";

test("growth source readiness validates and bounds evidence before SQL",async()=>{let queries=0;const governance=new PostgresBusinessSourceGovernance({pool:{async query(){queries+=1;throw new Error("must not query");}},clock:()=>new Date(Number.NaN)});await assert.rejects(()=>governance.tenantReadiness({organizationId:"org",workspaceId:"growth",tenantId:"tenant"},{applicationId:"ai-growth-sales-platform"}),error=>error.code==="BUSINESS_SOURCE_TENANT_READINESS_CLOCK_INVALID");await assert.rejects(()=>governance.tenantReadiness({organizationId:"bad scope",workspaceId:"growth",tenantId:"tenant"},{applicationId:"ai-growth-sales-platform"}),error=>error.code==="BUSINESS_SOURCE_TENANT_READINESS_SCOPE_REQUIRED");assert.equal(queries,0);let values,sql;const bounded=new PostgresBusinessSourceGovernance({pool:{async query(statement,params){sql=statement;values=params;return{rows:[]};}},clock:()=>new Date("2026-08-26T00:00:00Z")});await bounded.tenantReadiness({organizationId:"org",workspaceId:"growth",tenantId:"tenant"},{applicationId:"ai-growth-sales-platform",limit:999});assert.match(sql,/LIMIT \$5/);assert.equal(values[4],100);});

test("growth data-owner approval is tenant scoped, expiring and credential-value free", async () => {
  await ensurePostgresFixture();
  const pool = createTestPool(),
    suffix = randomUUID(),
    scope = {
      organizationId: `source-approval-${suffix}`,
      workspaceId: "growth",
      tenantId: "tenant-a",
    },
    owner = { ...scope, userId: "growth-data-owner" };
  let now = new Date("2026-08-26T10:00:00Z");
  try {
    const runtime = await createBusinessApplicationRuntime({
      repoRoot: process.cwd(),
      pool,
    });
    await migrateGrowthPlatform(pool);
    const connector = await runtime.connectorStore.register(
        {
          id: `growth-source-${suffix}`,
          applicationId: "ai-growth-sales-platform",
          sourceSystem: "governed-growth-source",
          connectorType: "API",
          credentialReferenceId: "growth-source-credential-ref",
          allowedObjectTypes: ["lead"],
          freshnessSeconds: 3600,
        },
        owner,
      ),
      governance = new PostgresBusinessSourceGovernance({
        pool,
        clock: () => now,
      }),
      pending = await governance.request(
        connector.id,
        {
          tenantId: scope.tenantId,
          dataOwnerId: owner.userId,
          mappingVersion: "growth-map-v1",
          expiresAt: "2026-08-27T10:00:00Z",
        },
        owner,
      ),
      approved = await governance.decide(
        pending.id,
        {
          decision: "APPROVED",
          expectedVersion: pending.version,
          reason: "Approved tenant source mapping",
        },
        owner,
      );
    assert.equal(approved.status, "APPROVED");
    const ready = await governance.tenantReadiness(scope, {
      applicationId: "ai-growth-sales-platform",
    });
    assert.equal(ready.status, "READY");
    assert.deepEqual(ready.summary, { total: 1, ready: 1, blocked: 0 });
    assert.deepEqual(ready.safety, {
      credentialValuesRead: false,
      externalCallsPerformed: false,
    });
    const revoked = await governance.decide(
      approved.id,
      {
        decision: "REVOKED",
        expectedVersion: approved.version,
        reason: "Rotate the governed authorization",
      },
      owner,
    );
    assert.equal(revoked.status, "REVOKED");
    assert.equal(
      (
        await governance.tenantReadiness(scope, {
          applicationId: "ai-growth-sales-platform",
        })
      ).status,
      "NOT_READY",
    );
    const replacementPending = await governance.request(
        connector.id,
        {
          tenantId: scope.tenantId,
          dataOwnerId: owner.userId,
          mappingVersion: "growth-map-v2",
          expiresAt: "2026-08-27T10:00:00Z",
        },
        owner,
      ),
      replacement = await governance.decide(
        replacementPending.id,
        {
          decision: "APPROVED",
          expectedVersion: replacementPending.version,
          reason: "Approve replacement authorization",
        },
        owner,
      ),
      latest = await governance.tenantReadiness(scope, {
        applicationId: "ai-growth-sales-platform",
      });
    assert.equal(replacement.status, "APPROVED");
    assert.equal(latest.status, "READY");
    const sequences = (
      await pool.query(
        "SELECT sequence_id FROM business_data_source_approval WHERE connector_id=$1 ORDER BY sequence_id",
        [connector.id],
      )
    ).rows.map((row) => Number(row.sequence_id));
    assert.equal(sequences.length, 2);
    assert.ok(sequences[1] > sequences[0]);
    const otherTenant = await governance.tenantReadiness(
      { ...scope, tenantId: "tenant-b" },
      { applicationId: "ai-growth-sales-platform" },
    );
    assert.equal(otherTenant.status, "NOT_READY");
    assert.equal(otherTenant.items[0].checks.approvalGranted, false);
    now = new Date("2026-08-27T10:00:01Z");
    const expired = await governance.tenantReadiness(scope, {
      applicationId: "ai-growth-sales-platform",
    });
    assert.equal(expired.status, "NOT_READY");
    assert.equal(expired.items[0].checks.authorizationUnexpired, false);
    assert.doesNotMatch(
      JSON.stringify(ready) + JSON.stringify(otherTenant) + JSON.stringify(expired),
      /growth-source-credential-ref|Approved tenant source mapping/,
    );
  } finally {
    await pool
      .query("DELETE FROM business_data_source_approval WHERE organization_id=$1", [
        scope.organizationId,
      ])
      .catch(() => {});
    await pool
      .query("DELETE FROM business_data_connector WHERE organization_id=$1", [
        scope.organizationId,
      ])
      .catch(() => {});
    await pool.end();
  }
});
