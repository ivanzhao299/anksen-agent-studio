import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildPhotoshopUxpDispatchPlan, evaluatePhotoshopUxpActivation } from "../lib/photoshop-uxp-utils.mjs";

const registry = JSON.parse(await readFile(new URL("../examples/runtime-adapters.example.json", import.meta.url), "utf8"));
const adapter = registry.adapters.find(item => item.adapter_id === "photoshop-uxp");
const job = {
  jobId: "JINHU-POSTER-001",
  requireApproval: true,
  governance: { executionMode: "human_confirmed", production: false, deploy: false }
};
const proposal = { status: "APPROVED", approved_job_id: job.jobId };
const node = { photoshop_running: true, uxp_plugin_loaded: true, interactive_user_session: true };

test("Photoshop adapter is registered fail-closed", () => {
  assert.ok(adapter);
  assert.equal(adapter.health_status, "disabled");
  const plan = buildPhotoshopUxpDispatchPlan({ adapter, proposal, node, job });
  assert.equal(plan.execution_status, "blocked");
  assert.match(plan.activation.blockers.join(" "), /health is not healthy/);
  assert.equal(plan.external_calls, "disabled");
});

test("healthy adapter reaches interactive confirmation, not autonomous execution", () => {
  const activation = evaluatePhotoshopUxpActivation({ adapter: { ...adapter, health_status: "healthy" }, proposal, node, job });
  assert.equal(activation.status, "READY_FOR_INTERACTIVE_CONFIRMATION");
  assert.equal(activation.execution_mode, "human_confirmed");
});

test("approval must be bound to the exact job", () => {
  const activation = evaluatePhotoshopUxpActivation({ adapter: { ...adapter, health_status: "healthy" }, proposal: { ...proposal, approved_job_id: "OTHER" }, node, job });
  assert.equal(activation.status, "BLOCKED");
  assert.match(activation.blockers.join(" "), /not bound/);
});

test("credential values fail closed", () => {
  const activation = evaluatePhotoshopUxpActivation({ adapter: { ...adapter, health_status: "healthy" }, proposal, node, job: { ...job, token: "forbidden" } });
  assert.equal(activation.status, "BLOCKED");
  assert.match(activation.blockers.join(" "), /Credential values are forbidden/);
});
