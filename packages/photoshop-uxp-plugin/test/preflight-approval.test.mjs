import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createHighRiskApprovalBinding, preflightAllowsOutput, preflightReportSha256 } = require("../src/preflight-approval.cjs");

const job = { jobId: "job-1" };
const document = { id: 42 };
const high = { score: 80, disposition: "REQUIRES_CONFIRMATION", exportAllowed: true, note: "review", issues: [{ code: "SMALL", severity: "HIGH", message: "small", suggestion: "increase" }] };

test("high-risk preflight is blocked until the exact report is confirmed", () => {
  assert.equal(preflightAllowsOutput(high, null, job, document), false);
  const binding = createHighRiskApprovalBinding(job, document, high, { humanConfirmed: true, confirmedAt: "2026-08-03T00:00:00Z" });
  assert.equal(binding.reportSha256, preflightReportSha256(high));
  assert.equal(preflightAllowsOutput(high, binding, job, document), true);
  assert.equal(preflightAllowsOutput({ ...high, score: 79 }, binding, job, document), false);
  assert.equal(preflightAllowsOutput({ ...high, issues: [{ ...high.issues[0], evidence: { actualPt: 17 } }] }, binding, job, document), false);
  assert.equal(preflightAllowsOutput(high, binding, job, { id: 43 }), false);
});
