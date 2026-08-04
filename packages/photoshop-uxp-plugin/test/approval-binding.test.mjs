import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { assertApprovalBinding, createApprovalBinding } = require("../src/approval-binding.cjs");

test("binds approval to the exact normalized job and Photoshop document", () => {
  const job = { jobId: "job-1", operations: [{ operation: "INSPECT_DOCUMENT" }] };
  const binding = createApprovalBinding(job, { id: 42 }, { humanConfirmed: true, confirmedAt: "2026-08-03T00:00:00Z" });
  assert.equal(assertApprovalBinding(binding, job, { id: 42 }), true);
  assert.throws(() => assertApprovalBinding(binding, { ...job, operations: [{ operation: "EXPORT_DOCUMENT" }] }, { id: 42 }), /JOB_MISMATCH/);
  assert.throws(() => assertApprovalBinding(binding, job, { id: 43 }), /DOCUMENT_MISMATCH/);
});
