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
  const unsupported = await evidence.readiness(
    { organizationId: "org", workspaceId: "growth", tenantId: "tenant" },
    { projectId: "project", approvalId: "approval", goalId: "goal", taskId: "task", runtimeType: "CONTROLLED_STUB", workerId: "worker", policyVersion: "v1" },
  );
  assert.equal(unsupported.status, "NOT_BOUND");
  assert.deepEqual(unsupported.blockers, ["RUNTIME_TYPE_UNSUPPORTED"]);
  assert.equal(queried, false);
});

test("growth runtime gate keeps probes and feature flag fail closed even when database references exist", async () => {
  let credentialChecks = 0,
    healthChecks = 0;
  const pool = { async query(sql) { return sql.includes("credential_reference_id") ? { rows: [{ credential_reference_id: "codex-runtime-ref" }], rowCount: 1 } : { rows: [{}], rowCount: 1 }; } },
    evidence = new PostgresGrowthRuntimeGateEvidence({ pool, credentialReferenceReady: async () => { credentialChecks += 1; return true; }, runtimeHealth: async () => { healthChecks += 1; return { status: "HEALTHY" }; }, env: { AUTONOMOUS_RUNTIME_CODEX_ENABLED: "false" } }),
    result = await evidence.readiness(
      { organizationId: "org", workspaceId: "growth", tenantId: "tenant" },
      { projectId: "project", approvalId: "approval", goalId: "goal", taskId: "task", runtimeType: "CODEX", workerId: "worker", policyVersion: "v1" },
    );
  assert.equal(result.status, "NOT_READY");
  for (const blocker of ["CREDENTIAL_REFERENCE_READY", "RUNTIME_HEALTH", "FEATURE_FLAG"]) assert.ok(result.blockers.includes(blocker));
  assert.equal(credentialChecks, 0);
  assert.equal(healthChecks, 0);
  assert.equal(result.safety.runtimeStarted, false);
});

test("growth runtime evidence probes only after every authoritative prerequisite passes", async () => {
  const calls = [],
    pool = { async query(sql) { return sql.includes("credential_reference_id") ? { rows: [{ credential_reference_id: "codex-runtime-ref" }], rowCount: 1 } : { rows: [{}], rowCount: 1 }; } },
    evidence = new PostgresGrowthRuntimeGateEvidence({
      pool,
      credentialReferenceReady: async (referenceId) => { calls.push(`credential:${referenceId}`); return true; },
      runtimeHealth: async (runtimeType) => { calls.push(`health:${runtimeType}`); return { status: "HEALTHY" }; },
      env: { AUTONOMOUS_RUNTIME_CODEX_ENABLED: "true" },
    }),
    result = await evidence.readiness(
      { organizationId: "org", workspaceId: "growth", tenantId: "tenant" },
      { projectId: "project", approvalId: "approval", goalId: "goal", taskId: "task", runtimeType: "CODEX", workerId: "worker", policyVersion: "v1" },
    );
  assert.equal(result.status, "READY");
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(calls, ["credential:codex-runtime-ref", "health:CODEX"]);
  assert.equal(result.safety.approvalConsumed, false);
  assert.equal(result.safety.runtimeStarted, false);
});

test("growth runtime evidence rejects unsafe bindings and converts probe failures to blockers",async()=>{let queries=0;const scope={organizationId:"org",workspaceId:"growth",tenantId:"tenant"},unsafe=new PostgresGrowthRuntimeGateEvidence({pool:{async query(){queries+=1;throw new Error("must not query");}},env:{AUTONOMOUS_RUNTIME_CODEX_ENABLED:"true"}}),binding={projectId:"project",approvalId:"approval",goalId:"goal",taskId:"task",runtimeType:"CODEX",workerId:"worker",policyVersion:"v1"};assert.deepEqual((await unsafe.readiness(scope,{...binding,workerId:"token=secret"})).blockers,["EXACT_RUNTIME_BINDING_INVALID"]);assert.equal(queries,0);const pool={async query(sql){return sql.includes("credential_reference_id")?{rows:[{credential_reference_id:"codex-runtime-ref"}],rowCount:1}:{rows:[{}],rowCount:1};}},failedCredential=new PostgresGrowthRuntimeGateEvidence({pool,credentialReferenceReady:async()=>{throw new Error("resolver unavailable");},runtimeHealth:async()=>{throw new Error("must not probe");},env:{AUTONOMOUS_RUNTIME_CODEX_ENABLED:"true"}}),result=await failedCredential.readiness(scope,binding);assert.equal(result.status,"NOT_READY");assert.ok(result.blockers.includes("CREDENTIAL_REFERENCE_READY"));assert.ok(result.blockers.includes("RUNTIME_HEALTH"));assert.equal(result.safety.runtimeStarted,false);});
