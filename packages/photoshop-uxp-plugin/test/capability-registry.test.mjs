import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { CAPABILITIES, capabilityProfile, listCapabilities } = require("../src/capability-registry.cjs");

test("publishes a reusable Photoshop capability profile rather than template buttons", () => {
  assert.equal(Object.keys(CAPABILITIES).length, 33);
  assert.equal(CAPABILITIES.APPLY_LAYER_MASK.intent, "MASKING");
  assert.equal(CAPABILITIES.CREATE_ADJUSTMENT_LAYER.executor, "BATCH_PLAY");
  const profile = capabilityProfile([{ operation: "CREATE_TEXT_LAYER" }, { operation: "APPLY_FILTER" }]);
  assert.deepEqual(profile.intents, ["TYPOGRAPHY", "MATERIAL_DETAIL"]);
  assert.deepEqual(profile.hostAcceptanceRequired, []);
  assert.match(profile.hostEvidence[0], /^PHOTOSHOP_27_9_MACOS_2026-08-04:/);
  assert.deepEqual(capabilityProfile([{ operation: "ROTATE_LAYER" }]).hostAcceptanceRequired, ["ROTATE_LAYER"]);
  assert.ok(listCapabilities({ intent: "COLOR_GRADE" }).length >= 3);
});
