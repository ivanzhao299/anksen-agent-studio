import test from "node:test";
import assert from "node:assert/strict";
import { PostgresGrowthRuntimeGateEvidence } from "../lib/postgres-growth-runtime-gate-evidence.mjs";

test("growth runtime gate requires an exact existing Runtime binding and performs no activation", async () => {
  let queried = false;
  const evidence = new PostgresGrowthRuntimeGateEvidence({ pool: { async query() { queried = true; throw new Error("must not query without binding"); } }, env: {} }),
    result = await evidence.readiness({ organizationId: "org", workspaceId: "growth", tenantId: "tenant" }, null);
  assert.equal(result.status, "NOT_BOUND");
  assert.deepEqual(result.blockers, ["EXACT_RUNTIME_BINDING_MISSING"]);
  assert.equal(queried, false);
  assert.deepEqual(result.safety, { approvalConsumed: false, runtimeStarted: false, credentialValuesRead: false, externalCallsPerformed: false });
});

test("growth runtime gate keeps probes and feature flag fail closed even when database references exist", async () => {
  const pool = { async query(sql) { return sql.includes("credential_reference_id") ? { rows: [{ credential_reference_id: "codex-runtime-ref" }], rowCount: 1 } : { rows: [{}], rowCount: 1 }; } },
    evidence = new PostgresGrowthRuntimeGateEvidence({ pool, env: { AUTONOMOUS_RUNTIME_CODEX_ENABLED: "false" } }),
    result = await evidence.readiness(
      { organizationId: "org", workspaceId: "growth", tenantId: "tenant" },
      { projectId: "project", approvalId: "approval", goalId: "goal", taskId: "task", runtimeType: "CODEX", workerId: "worker", policyVersion: "v1" },
    );
  assert.equal(result.status, "NOT_READY");
  for (const blocker of ["CREDENTIAL_REFERENCE_READY", "RUNTIME_HEALTH", "FEATURE_FLAG"]) assert.ok(result.blockers.includes(blocker));
  assert.equal(result.safety.runtimeStarted, false);
});
