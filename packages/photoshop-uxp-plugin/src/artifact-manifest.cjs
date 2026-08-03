"use strict";

const { sha256Hex } = require("./crypto-sha256.cjs");

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const pairs = Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${pairs.join(",")}}`;
  }
  return JSON.stringify(value);
}

async function describeEntry(entry, format) {
  const binary = await entry.read({ format: "binary" });
  const bytes = binary instanceof ArrayBuffer ? new Uint8Array(binary) : new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength);
  return Object.freeze({ name: entry.name, format, sizeBytes: bytes.byteLength, sha256: sha256Hex(bytes) });
}

function preflightReportSha256(preflight) {
  if (!preflight || !Array.isArray(preflight.issues)) throw new Error("A complete preflight report is required.");
  return sha256Hex(stableStringify({
    score: preflight.score,
    disposition: preflight.disposition,
    exportAllowed: preflight.exportAllowed,
    note: preflight.note || null,
    issues: preflight.issues
  }));
}

async function buildArtifactManifest({ job, executionResult, preflight, approvalBinding, highRiskBinding = null, outputEntries = [] }) {
  if (!executionResult || executionResult.status !== "COMPLETED") throw new Error("A completed execution result is required before building an artifact manifest.");
  if (!preflight || preflight.exportAllowed !== true || preflight.disposition === "BLOCKED") throw new Error("A passing technical preflight is required before building an artifact manifest.");
  if (!approvalBinding || approvalBinding.jobId !== job.jobId || approvalBinding.documentId == null || approvalBinding.humanConfirmed !== true) throw new Error("A job and document-bound human approval is required before building an artifact manifest.");
  const reportSha256 = preflightReportSha256(preflight);
  const highRiskConfirmed = preflight.disposition === "REQUIRES_CONFIRMATION";
  if (highRiskConfirmed && (!highRiskBinding || highRiskBinding.humanConfirmed !== true || highRiskBinding.jobId !== job.jobId || highRiskBinding.documentId !== approvalBinding.documentId || highRiskBinding.reportSha256 !== reportSha256)) {
    throw new Error("A job, document and report-bound second confirmation is required for high-risk preflight issues.");
  }
  const artifacts = [];
  for (const item of outputEntries) artifacts.push(await describeEntry(item.entry, item.format));
  if (!artifacts.length) throw new Error("At least one produced artifact is required.");
  const manifest = {
    schemaVersion: 1,
    kind: "PHOTOSHOP_DESIGN_RESULT",
    jobId: job.jobId,
    status: executionResult.status,
    jobSpecSha256: approvalBinding.jobSpecSha256,
    approvedDocumentId: approvalBinding.documentId,
    approvalId: job.governance.approvalId,
    approvalSource: job.governance.approvalSource,
    operationSummary: executionResult.plan || job.operationSummary || null,
    preflight: { score: preflight.score, disposition: preflight.disposition, exportAllowed: preflight.exportAllowed, note: preflight.note || null, issues: preflight.issues, issueCount: preflight.issues.length, checkedAt: preflight.checkedAt, reportSha256 },
    artifacts,
    producedAt: new Date().toISOString(),
    governance: { humanConfirmed: true, highRiskConfirmed, highRiskReportSha256: highRiskConfirmed ? reportSha256 : null, approvedJobId: job.governance.approvedJobId, approvalId: job.governance.approvalId, approvalSource: job.governance.approvalSource, production: false, deploy: false }
  };
  return Object.freeze({ ...manifest, manifestSha256: sha256Hex(stableStringify(manifest)) });
}

module.exports = { buildArtifactManifest, describeEntry, preflightReportSha256, stableStringify };
