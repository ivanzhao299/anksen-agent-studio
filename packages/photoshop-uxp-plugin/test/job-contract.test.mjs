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
  assert.deepEqual(job.content.features, ["科创孵化", "产业协同", "成果转化"]);
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
    practiceContext: {
      protocolId: "design-practice-v1",
      protocolVersion: "1.0.0",
      evidenceHash: "a".repeat(64),
      approvedDirectionId: "direction-1",
      stage: "PHOTOSHOP_PRODUCTION",
      passedGates: ["TASK_MODEL", "RESEARCH_DIAGNOSIS", "CONCEPT_DIVERGENCE", "COPY_EDITING", "ART_DIRECTION", "COMPOSITION_PROTOTYPE", "ASSET_CREATION"],
      toolIntentIds: ["TYPOGRAPHY", "PRESS_OUTPUT"]
    },
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
  assert.equal(job.practiceContext.approvedDirectionId, "direction-1");
});

test("requires upstream design evidence and tool intent for V2 Photoshop work", () => {
  const base = {
    schemaVersion: 2,
    jobId: "practice-required",
    title: "Practice required",
    executionMode: "MODIFY_ACTIVE_DOCUMENT",
    document: { widthPx: 1000, heightPx: 1000, resolution: 150, colorMode: "RGB" },
    operations: [{ operationId: "replace", operation: "REPLACE_TEXT", target: { layerId: 1 }, parameters: { text: "Title" } }, { operationId: "export", operation: "EXPORT_DOCUMENT", parameters: { format: "png" } }],
    outputs: [{ format: "png" }],
    requireApproval: true,
    governance: { executionMode: "human_confirmed", production: false, deploy: false, approvedJobId: "practice-required", approvalId: "approval-1", approvalSource: "STUDIO" }
  };
  assert.throws(() => validateJob(base), /practiceContext/);
  const practiceContext = { protocolId: "design-practice-v1", protocolVersion: "1.0.0", evidenceHash: "b".repeat(64), approvedDirectionId: "direction-1", stage: "PHOTOSHOP_PRODUCTION", passedGates: ["TASK_MODEL", "RESEARCH_DIAGNOSIS", "CONCEPT_DIVERGENCE", "COPY_EDITING", "ART_DIRECTION", "COMPOSITION_PROTOTYPE", "ASSET_CREATION"], toolIntentIds: ["PRESS_OUTPUT"] };
  assert.throws(() => validateJob({ ...base, practiceContext }), /REPLACE_TEXT requires declared intent TYPOGRAPHY/);
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

test("accepts a governed V3 create-document command graph with complete capability intents", () => {
  const job = validateJob({
    schemaVersion: 3,
    jobId: "generic-poster-v3",
    title: "Generic governed poster",
    executionMode: "CREATE_DOCUMENT",
    document: { widthPx: 2400, heightPx: 3600, resolution: 150, colorMode: "RGB", safeMarginPx: 120 },
    brief: { goal: "Create an editable production poster", audience: "Business visitors" },
    sourceAssetRefs: [],
    practiceContext: {
      protocolId: "design-practice-v1", protocolVersion: "1.1.0", evidenceHash: "c".repeat(64), approvedDirectionId: "direction-v3", stage: "PHOTOSHOP_PRODUCTION",
      passedGates: ["TASK_MODEL", "RESEARCH_DIAGNOSIS", "CONCEPT_DIVERGENCE", "COPY_EDITING", "ART_DIRECTION", "COMPOSITION_PROTOTYPE", "ASSET_CREATION"],
      toolIntentIds: ["TYPOGRAPHY", "COLOR_GRADE", "PRESS_OUTPUT"]
    },
    commandGraph: { schemaVersion: 1, graphId: "poster-command-graph", nodes: [
      { nodeId: "background", command: { operation: "CREATE_SOLID_FILL_LAYER", parameters: { name: "00_BACKGROUND", color: { red: 242, green: 246, blue: 250 }, opacity: 100 } } },
      { nodeId: "title", command: { operation: "CREATE_TEXT_LAYER", parameters: { name: "10_TITLE", text: "A NEW STANDARD", position: { x: 180, y: 480 }, fontSize: 120, color: { red: 12, green: 29, blue: 51 } } } },
      { nodeId: "style-title", dependsOn: ["title"], command: { operation: "SET_TEXT_STYLE", target: { nodeOutput: "title" }, parameters: { tracking: 120 } } },
      { nodeId: "save", dependsOn: ["background", "style-title"], command: { operation: "SAVE_COPY", parameters: { format: "psd", suggestedName: "poster.psd" } } },
      { nodeId: "preview", dependsOn: ["background", "style-title"], command: { operation: "EXPORT_DOCUMENT", parameters: { format: "png", suggestedName: "poster.png" } } }
    ] },
    outputs: [{ format: "psd", preserveLayers: true }, { format: "png" }],
    reviewCriteria: { minimumFontSizePt: 18, requireEditableText: true, requireSemanticLayerNames: true },
    requireApproval: true,
    governance: { executionMode: "human_confirmed", production: false, deploy: false, approvedJobId: "generic-poster-v3", approvalId: "approval-v3", approvalSource: "STUDIO" }
  });
  assert.equal(job.schemaVersion, 3);
  assert.equal(job.executionMode, "CREATE_DOCUMENT");
  assert.equal(job.commandGraph.summary.nodes, 5);
  assert.ok(job.capabilityProfile.capabilityIds.includes("text-layer.create"));
});

test("rejects V3 command graphs whose actual capabilities exceed declared intent", () => {
  const value = {
    schemaVersion: 3, jobId: "intent-gap", title: "Intent gap", executionMode: "CREATE_DOCUMENT",
    document: { widthPx: 1000, heightPx: 1000, resolution: 150, colorMode: "RGB" }, sourceAssetRefs: [],
    practiceContext: { protocolId: "design-practice-v1", protocolVersion: "1.0.0", evidenceHash: "d".repeat(64), approvedDirectionId: "d", stage: "PHOTOSHOP_PRODUCTION", passedGates: ["TASK_MODEL", "RESEARCH_DIAGNOSIS", "CONCEPT_DIVERGENCE", "COPY_EDITING", "ART_DIRECTION", "COMPOSITION_PROTOTYPE", "ASSET_CREATION"], toolIntentIds: ["TYPOGRAPHY"] },
    commandGraph: { nodes: [{ nodeId: "noise", command: { operation: "APPLY_FILTER", target: { layerId: 1 }, parameters: { type: "ADD_NOISE", amount: 2 } } }] },
    outputs: [{ format: "png", required: false }], requireApproval: true,
    governance: { executionMode: "human_confirmed", production: false, deploy: false, approvedJobId: "intent-gap", approvalId: "approval", approvalSource: "STUDIO" }
  };
  assert.throws(() => validateJob(value), /MATERIAL_DETAIL/);
});
