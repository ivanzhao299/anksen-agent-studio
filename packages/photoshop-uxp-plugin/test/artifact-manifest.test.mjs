import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildArtifactManifest, stableStringify } = require("../src/artifact-manifest.cjs");

test("builds a reproducible manifest with per-file checksums", async () => {
  const entry = { name: "proof.png", async read() { return new TextEncoder().encode("pixels").buffer; } };
  const job = { jobId: "job-1", governance: { approvedJobId: "job-1", approvalId: "approval-1", approvalSource: "STUDIO" } };
  const result = await buildArtifactManifest({ job, executionResult: { status: "COMPLETED", plan: { total: 1 } }, preflight: { score: 96, disposition: "READY", exportAllowed: true, checkedAt: "2026-08-03T00:00:00Z", issues: [] }, approvalBinding: { jobId: "job-1", documentId: 7, jobSpecSha256: "a".repeat(64), humanConfirmed: true }, outputEntries: [{ entry, format: "png" }] });
  assert.equal(result.artifacts[0].sha256.length, 64);
  assert.equal(result.preflight.reportSha256.length, 64);
  assert.equal(result.governance.highRiskConfirmed, false);
  assert.equal(result.manifestSha256.length, 64);
  assert.equal(stableStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test("requires a report-bound second confirmation for high-risk preflight", async () => {
  const entry = { name: "proof.png", async read() { return new TextEncoder().encode("pixels").buffer; } };
  const job = { jobId: "job-high", governance: { approvedJobId: "job-high", approvalId: "approval-high", approvalSource: "STUDIO" } };
  const preflight = { score: 82, disposition: "REQUIRES_CONFIRMATION", exportAllowed: true, checkedAt: "2026-08-03T00:00:00Z", note: "review", issues: [{ code: "TEXT_BELOW_MINIMUM_SIZE", severity: "HIGH", message: "small", suggestion: "increase" }] };
  const approvalBinding = { jobId: "job-high", documentId: 9, jobSpecSha256: "a".repeat(64), humanConfirmed: true };
  await assert.rejects(() => buildArtifactManifest({ job, executionResult: { status: "COMPLETED", plan: { total: 1 } }, preflight, approvalBinding, outputEntries: [{ entry, format: "png" }] }), /second confirmation/);
  const { preflightReportSha256 } = require("../src/artifact-manifest.cjs");
  const highRiskBinding = { jobId: "job-high", documentId: 9, reportSha256: preflightReportSha256(preflight), humanConfirmed: true };
  const result = await buildArtifactManifest({ job, executionResult: { status: "COMPLETED", plan: { total: 1 } }, preflight, approvalBinding, highRiskBinding, outputEntries: [{ entry, format: "png" }] });
  assert.equal(result.governance.highRiskConfirmed, true);
  assert.equal(result.governance.highRiskReportSha256, result.preflight.reportSha256);
});

test("preflight hash covers full issue evidence and fix metadata", () => {
  const { preflightReportSha256 } = require("../src/artifact-manifest.cjs");
  const base = { score: 82, disposition: "REQUIRES_CONFIRMATION", exportAllowed: true, note: "review", issues: [{ code: "SMALL", severity: "HIGH", message: "small", suggestion: "increase", evidence: { actualPt: 12 }, autoFixable: false, fixOperation: null }] };
  assert.notEqual(preflightReportSha256(base), preflightReportSha256({ ...base, issues: [{ ...base.issues[0], evidence: { actualPt: 17 } }] }));
  assert.notEqual(preflightReportSha256(base), preflightReportSha256({ ...base, issues: [{ ...base.issues[0], autoFixable: true, fixOperation: { operation: "REPLACE_TEXT" } }] }));
});
