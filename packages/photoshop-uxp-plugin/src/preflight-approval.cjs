"use strict";

const { preflightReportSha256 } = require("./artifact-manifest.cjs");

function createHighRiskApprovalBinding(job, document, preflight, options = {}) {
  if (!job?.jobId || document?.id == null) throw new Error("A validated job and active Photoshop document are required.");
  if (preflight?.disposition !== "REQUIRES_CONFIRMATION" || preflight.exportAllowed !== true) throw new Error("HIGH_RISK_PREFLIGHT_REQUIRED");
  return Object.freeze({
    jobId: job.jobId,
    documentId: document.id,
    reportSha256: preflightReportSha256(preflight),
    humanConfirmed: options.humanConfirmed === true,
    confirmedAt: options.confirmedAt || new Date().toISOString()
  });
}

function assertHighRiskApprovalBinding(binding, job, document, preflight) {
  if (preflight?.disposition !== "REQUIRES_CONFIRMATION") return true;
  if (!binding || binding.humanConfirmed !== true) throw new Error("HIGH_RISK_CONFIRMATION_REQUIRED");
  if (binding.jobId !== job?.jobId) throw new Error("HIGH_RISK_JOB_MISMATCH");
  if (binding.documentId !== document?.id) throw new Error("HIGH_RISK_DOCUMENT_MISMATCH");
  if (binding.reportSha256 !== preflightReportSha256(preflight)) throw new Error("HIGH_RISK_REPORT_MISMATCH");
  return true;
}

function preflightAllowsOutput(preflight, highRiskBinding, job, document) {
  if (!preflight || preflight.exportAllowed !== true || preflight.disposition === "BLOCKED") return false;
  if (preflight.disposition === "READY") return true;
  if (preflight.disposition !== "REQUIRES_CONFIRMATION") return false;
  try {
    return assertHighRiskApprovalBinding(highRiskBinding, job, document, preflight);
  } catch {
    return false;
  }
}

module.exports = {
  assertHighRiskApprovalBinding,
  createHighRiskApprovalBinding,
  preflightAllowsOutput,
  preflightReportSha256
};
