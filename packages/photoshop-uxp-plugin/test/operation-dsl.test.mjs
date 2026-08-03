import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validateOperationPlan, OperationValidationError } = require("../src/operation-dsl.cjs");

test("normalizes a deterministic whitelisted operation plan", () => {
  const plan = validateOperationPlan([
    { operationId: "inspect", operation: "INSPECT_DOCUMENT" },
    { operationId: "title", operation: "REPLACE_TEXT", target: { layerName: "10_TITLE_园区名称" }, parameters: { text: "金湖科创产业园" } },
    { operationId: "export", operation: "EXPORT_DOCUMENT", parameters: { format: "png", suggestedName: "proof.png" } }
  ]);
  assert.deepEqual(plan.summary, { total: 3, reads: 1, writes: 2, highRisk: 1, requiresApproval: true });
  assert.equal(plan.operations[1].risk, "MEDIUM");
  assert.equal(plan.operations[2].parameters.format, "png");
});

test("rejects raw Photoshop descriptors and script injection", () => {
  assert.throws(() => validateOperationPlan([{ operation: "INSPECT_DOCUMENT", parameters: { batchPlay: "bad" } }]), OperationValidationError);
  assert.throws(() => validateOperationPlan([{ operation: "REPLACE_TEXT", target: { layerId: 1 }, parameters: { text: "eval(alert(1))" } }]), /raw execution/);
});

test("rejects ambiguous targets and duplicate idempotency keys", () => {
  assert.throws(() => validateOperationPlan([{ operation: "RENAME_LAYER", target: { layerId: 1, layerName: "x" }, parameters: { name: "good" } }]), /exactly one/);
  assert.throws(() => validateOperationPlan([
    { operationId: "one", idempotencyKey: "same", operation: "INSPECT_DOCUMENT" },
    { operationId: "two", idempotencyKey: "same", operation: "INSPECT_DOCUMENT" }
  ]), /idempotencyKey/);
});

test("requires every output to be in the terminal suffix", () => {
  assert.throws(() => validateOperationPlan([
    { operationId: "export", operation: "EXPORT_DOCUMENT", parameters: { format: "png" } },
    { operationId: "rename", operation: "RENAME_LAYER", target: { layerId: 1 }, parameters: { name: "late mutation" } }
  ]), /terminal suffix/);
  assert.doesNotThrow(() => validateOperationPlan([
    { operationId: "rename", operation: "RENAME_LAYER", target: { layerId: 1 }, parameters: { name: "final" } },
    { operationId: "save", operation: "SAVE_COPY", parameters: { format: "psd" } },
    { operationId: "export", operation: "EXPORT_DOCUMENT", parameters: { format: "png" } }
  ]));
});

test("rejects misleading per-operation timeout fields", () => {
  assert.throws(() => validateOperationPlan([{ operation: "INSPECT_DOCUMENT", timeoutMs: 1000 }]), /not supported/);
});
