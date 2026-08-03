import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { buildPhotoshopUxpDispatchPlan, evaluatePhotoshopUxpActivation, evaluatePhotoshopUxpResult } from "../lib/photoshop-uxp-utils.mjs";

const registry = JSON.parse(await readFile(new URL("../examples/runtime-adapters.example.json", import.meta.url), "utf8"));
const adapter = registry.adapters.find(item => item.adapter_id === "photoshop-uxp");
const job = {
  jobId: "JINHU-POSTER-001",
  requireApproval: true,
  outputs: [{ format: "png", required: true }],
  governance: { executionMode: "human_confirmed", production: false, deploy: false, approvedJobId: "JINHU-POSTER-001", approvalId: "approval-1", approvalSource: "STUDIO" }
};
const proposal = { status: "APPROVED", approved_job_id: job.jobId, approval_id: "approval-1" };
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

test("V2 dispatch rejects raw BatchPlay and unsupported operations at the adapter boundary", () => {
  const v2 = { ...job, schemaVersion: 2, operations: [{ operationId: "raw", operation: "RUN_SCRIPT", parameters: { batchPlay: {} } }] };
  const activation = evaluatePhotoshopUxpActivation({ adapter: { ...adapter, health_status: "healthy" }, proposal, node, job: v2 });
  assert.equal(activation.status, "BLOCKED");
  assert.match(activation.blockers.join(" "), /Unsupported Photoshop operation/);
  assert.match(activation.blockers.join(" "), /Raw Photoshop execution fields/);
});

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const hash = value => createHash("sha256").update(value).digest("hex");
function validResult() {
  const preflight = { score: 100, disposition: "READY", exportAllowed: true, note: "pass", issues: [], issueCount: 0, checkedAt: "2026-08-03T00:00:00Z" };
  preflight.reportSha256 = hash(stableStringify({ score: preflight.score, disposition: preflight.disposition, exportAllowed: preflight.exportAllowed, note: preflight.note, issues: preflight.issues }));
  const unsigned = {
    schemaVersion: 1,
    kind: "PHOTOSHOP_DESIGN_RESULT",
    jobId: job.jobId,
    status: "COMPLETED",
    jobSpecSha256: hash(stableStringify(job)),
    approvedDocumentId: 42,
    approvalId: "approval-1",
    approvalSource: "STUDIO",
    operationSummary: { total: 1 },
    preflight,
    artifacts: [{ name: "proof.png", format: "png", sha256: "b".repeat(64), sizeBytes: 4096 }],
    producedAt: "2026-08-03T00:00:01Z",
    governance: { humanConfirmed: true, highRiskConfirmed: false, highRiskReportSha256: null, approvedJobId: job.jobId, approvalId: "approval-1", approvalSource: "STUDIO", production: false, deploy: false }
  };
  return { ...unsigned, manifestSha256: hash(stableStringify(unsigned)) };
}

test("result manifest must be job-bound, canonically checksummed, complete and pass technical preflight", () => {
  const result = evaluatePhotoshopUxpResult({ job, result: validResult() });
  assert.equal(result.status, "READY_FOR_HUMAN_VISUAL_REVIEW");
  const blocked = evaluatePhotoshopUxpResult({ job, result: { ...validResult(), jobId: "OTHER", artifacts: [], preflight: null } });
  assert.equal(blocked.status, "BLOCKED");
  assert.ok(blocked.blockers.length >= 4);
});

test("rejects plausible-looking fake hashes and missing preflight", () => {
  const fake = { ...validResult(), manifestSha256: "a".repeat(64), preflight: undefined };
  const result = evaluatePhotoshopUxpResult({ job, result: fake });
  assert.equal(result.status, "BLOCKED");
  assert.match(result.blockers.join(" "), /does not match|preflight/);
});

test("adapter rejects output-before-mutation plans and unsupported timeout claims", () => {
  const v2 = { ...job, schemaVersion: 2, operations: [
    { operationId: "export", operation: "EXPORT_DOCUMENT", parameters: { format: "png" } },
    { operationId: "rename", operation: "RENAME_LAYER", target: { layerId: 1 }, parameters: { name: "late" }, timeoutMs: 1000 }
  ] };
  const activation = evaluatePhotoshopUxpActivation({ adapter: { ...adapter, health_status: "healthy" }, proposal, node, job: v2 });
  assert.equal(activation.status, "BLOCKED");
  assert.match(activation.blockers.join(" "), /terminal suffix/);
  assert.match(activation.blockers.join(" "), /timeout is not supported/);
});

test("adapter requires report-bound second confirmation for high-risk preflight", () => {
  const base = validResult();
  const highPreflight = { ...base.preflight, disposition: "REQUIRES_CONFIRMATION", issues: [{ code: "SMALL", severity: "HIGH", message: "small", suggestion: "increase", evidence: { actualPt: 12 }, autoFixable: false, fixOperation: null }], issueCount: 1 };
  highPreflight.reportSha256 = hash(stableStringify({ score: highPreflight.score, disposition: highPreflight.disposition, exportAllowed: highPreflight.exportAllowed, note: highPreflight.note, issues: highPreflight.issues }));
  const unsigned = { ...base, preflight: highPreflight, governance: { ...base.governance, highRiskConfirmed: false, highRiskReportSha256: null } };
  delete unsigned.manifestSha256;
  const blocked = evaluatePhotoshopUxpResult({ job, result: { ...unsigned, manifestSha256: hash(stableStringify(unsigned)) } });
  assert.equal(blocked.status, "BLOCKED");
  assert.match(blocked.blockers.join(" "), /second confirmation/);
  const confirmedUnsigned = { ...unsigned, governance: { ...unsigned.governance, highRiskConfirmed: true, highRiskReportSha256: unsigned.preflight.reportSha256 } };
  const ready = evaluatePhotoshopUxpResult({ job, result: { ...confirmedUnsigned, manifestSha256: hash(stableStringify(confirmedUnsigned)) } });
  assert.equal(ready.status, "READY_FOR_HUMAN_VISUAL_REVIEW");
});

test("adapter independently recomputes the complete preflight report hash", () => {
  const base = validResult();
  const tamperedUnsigned = { ...base, preflight: { ...base.preflight, issues: [{ code: "SMALL", severity: "HIGH", message: "small", suggestion: "increase", evidence: { actualPt: 17 } }], issueCount: 1 } };
  delete tamperedUnsigned.manifestSha256;
  const result = evaluatePhotoshopUxpResult({ job, result: { ...tamperedUnsigned, manifestSha256: hash(stableStringify(tamperedUnsigned)) } });
  assert.equal(result.status, "BLOCKED");
  assert.match(result.blockers.join(" "), /canonically checksummed technical preflight/);
});
