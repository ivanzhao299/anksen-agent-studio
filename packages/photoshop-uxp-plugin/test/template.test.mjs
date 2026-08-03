import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validateJob } = require("../src/job-contract.cjs");
const { mmToPx, createLayout, sampleJob } = require("../src/jinhu-template.cjs");

test("converts the 640 by 1440 millimetre canvas at 150 dpi", () => {
  const job = validateJob(sampleJob());
  const layout = createLayout(job);
  assert.equal(layout.width, mmToPx(640, 150));
  assert.equal(layout.height, mmToPx(1440, 150));
  assert.ok(Math.abs(layout.width / layout.height - 4 / 9) < 0.001);
});

test("keeps key content above the stand exclusion zone", () => {
  const layout = createLayout(validateJob(sampleJob()));
  assert.ok(layout.slogan.y < layout.height - layout.standExclusion);
  assert.ok(layout.safe > layout.bleed);
});
