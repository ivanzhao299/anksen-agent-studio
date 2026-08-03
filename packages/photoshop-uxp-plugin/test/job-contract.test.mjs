import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validateJob, JobValidationError } = require("../src/job-contract.cjs");
const { sampleJob } = require("../src/jinhu-template.cjs");

test("accepts the governed Jinhu poster job", () => {
  const job = validateJob(sampleJob());
  assert.equal(job.templateId, "jinhu-park-64x144-v1");
  assert.equal(job.document.widthMm, 640);
  assert.deepEqual(job.content.features, ["创新策源", "产业协同", "企业成长"]);
});

test("requires explicit human approval mode", () => {
  const job = sampleJob();
  job.governance.executionMode = "automatic";
  assert.throws(() => validateJob(job), JobValidationError);
});

test("rejects arbitrary Photoshop operations", () => {
  const job = sampleJob();
  job.operations.push("run_arbitrary_script");
  assert.throws(() => validateJob(job), /not allowed/);
});

test("rejects production and deployment flags", () => {
  for (const field of ["production", "deploy"]) {
    const job = sampleJob();
    job.governance[field] = true;
    assert.throws(() => validateJob(job), JobValidationError);
  }
});

test("rejects markup and control characters in content", () => {
  const job = sampleJob();
  job.content.title = "<script>bad</script>";
  assert.throws(() => validateJob(job), JobValidationError);
});

test("accepts a governed V2 active-document operation plan", () => {
  const job = validateJob({
    schemaVersion: 2,
    jobId: "jinhu-production-v2",
    title: "金湖展板印前生产",
    executionMode: "MODIFY_ACTIVE_DOCUMENT",
    document: { widthPx: 3780, heightPx: 8504, resolution: 150, colorMode: "RGB", safeMarginPx: 180 },
    operations: [
      { operationId: "inspect", operation: "INSPECT_DOCUMENT" },
      { operationId: "replace-title", operation: "REPLACE_TEXT", target: { layerName: "10_TITLE_园区名称" }, parameters: { text: "金湖科创产业园" } },
      { operationId: "save", operation: "SAVE_COPY", parameters: { format: "psd" } },
      { operationId: "proof", operation: "EXPORT_DOCUMENT", parameters: { format: "png" } }
    ],
    outputs: [{ format: "psd" }, { format: "png" }],
    reviewCriteria: { minimumFontSizePt: 18 },
    requireApproval: true,
    governance: { executionMode: "human_confirmed", production: false, deploy: false, approvedJobId: "jinhu-production-v2", approvalId: "studio-approval-1", approvalSource: "STUDIO" }
  });
  assert.equal(job.schemaVersion, 2);
  assert.equal(job.operationSummary.writes, 3);
  assert.equal(job.reviewCriteria.minimumFontSizePt, 18);
});

test("requires approval provenance bound to the exact job", () => {
  const value = sampleJob();
  value.governance.approvedJobId = "OTHER";
  assert.throws(() => validateJob(value), /approvedJobId/);
});

test("rejects unimplemented V2 document creation", () => {
  const value = sampleJob();
  value.schemaVersion = 2;
  value.title = "Create";
  value.executionMode = "CREATE_TEMPLATE";
  value.document = { widthPx: 3780, heightPx: 8504, resolution: 150, colorMode: "RGB" };
  value.operations = [{ operationId: "inspect", operation: "INSPECT_DOCUMENT" }];
  value.outputs = [{ format: "png" }];
  delete value.content;
  assert.throws(() => validateJob(value), /MODIFY_ACTIVE_DOCUMENT/);
});
