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
  assert.deepEqual(job.content.features, ["科技创新", "产业协同", "企业服务"]);
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
