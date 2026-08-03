"use strict";

const { stableStringify } = require("./artifact-manifest.cjs");
const { sha256Hex } = require("./crypto-sha256.cjs");

function jobSpecSha256(job) {
  return sha256Hex(stableStringify(job));
}

function createApprovalBinding(job, document, options = {}) {
  if (!job?.jobId || document?.id == null) throw new Error("A validated job and active Photoshop document are required.");
  return Object.freeze({
    jobId: job.jobId,
    jobSpecSha256: jobSpecSha256(job),
    documentId: document.id,
    humanConfirmed: options.humanConfirmed === true,
    confirmedAt: options.confirmedAt || new Date().toISOString()
  });
}

function assertApprovalBinding(binding, job, document) {
  if (!binding || binding.humanConfirmed !== true) throw new Error("APPROVAL_BINDING_REQUIRED");
  if (binding.jobId !== job?.jobId || binding.jobSpecSha256 !== jobSpecSha256(job)) throw new Error("APPROVAL_JOB_MISMATCH");
  if (binding.documentId !== document?.id) throw new Error("APPROVAL_DOCUMENT_MISMATCH");
  return true;
}

module.exports = { assertApprovalBinding, createApprovalBinding, jobSpecSha256 };
