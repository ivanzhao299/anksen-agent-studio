import test from "node:test";
import assert from "node:assert/strict";
import { GrowthProductionOperationsPolicy } from "../lib/growth-production-operations-policy.mjs";

test("growth production operations policy reuses the global dry-run gate and fails closed", async () => {
  const policy = new GrowthProductionOperationsPolicy();
  const status = await policy.status();
  assert.equal(status.status, "BLOCKED");
  assert.equal(status.mode, "dry_run_only");
  assert.equal(status.productionOperations, "forbidden");
  assert.equal(status.gateId, "production-operations-blocked");
  assert.equal(status.gateStatus, "BLOCKED");
  assert.equal(status.safety.productionOperationsEnabled, false);
  assert.equal(status.safety.credentialValuesRead, false);
  assert.equal(status.safety.externalCallsPerformed, false);
  assert.equal(await policy.authorize(), false);
});

test("growth production operations policy cannot infer authorization from a missing gate", async () => {
  const policy = new GrowthProductionOperationsPolicy({
    load: async () => ({
      policy: {
        policy_id: "fixture",
        mode: "dry_run_only",
        forbidden_operations: [],
        production_operations: "forbidden",
      },
      gates: { release_gates: [] },
    }),
  });
  const status = await policy.status();
  assert.equal(status.status, "BLOCKED");
  assert.equal(status.gateStatus, "MISSING");
  assert.equal(await policy.authorize(), false);
});
