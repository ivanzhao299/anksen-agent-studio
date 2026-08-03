import test from "node:test";
import assert from "node:assert/strict";
import { DesignPracticeProtocol } from "../lib/design-practice-protocol.mjs";

const inventory = {
  resources: [
    { resource_id: "awesome-design-md", integrity_status: "PASS", evidence_hash: "a".repeat(64), featured: [{ id: "linear.app", sha256: "1".repeat(64) }, { id: "vercel", sha256: "2".repeat(64) }] },
    { resource_id: "taste-skill", integrity_status: "PASS", evidence_hash: "b".repeat(64), featured: [{ id: "taste", sha256: "3".repeat(64) }] },
    { resource_id: "impeccable", integrity_status: "PASS", evidence_hash: "c".repeat(64), featured: [{ id: "impeccable", sha256: "4".repeat(64) }] }
  ]
};
const resourceRegistry = { async inventory() { return inventory; } };
const validRequest = {
  designTaskId: "design-1",
  artifactType: "ROLLUP",
  medium: "PRINT",
  objective: "Create a memorable industrial innovation message",
  audience: "Enterprise decision makers",
  viewing: { distanceMeters: 3 },
  physicalSpec: { widthMm: 640, heightMm: 1440, bleedMm: 0, resolutionPpi: 150, targetColorSpace: "CMYK" },
  brandAssetsStatus: "READY",
  printerProfileStatus: "PENDING",
  innovationMode: "EXPLORATORY",
  photoshopIntents: ["HERO_COMPOSITE", "TYPOGRAPHY", "PRESS_OUTPUT"]
};

test("compiles a stage-based evidence protocol without assigning agent ownership", async () => {
  const plan = await new DesignPracticeProtocol({ resourceRegistry }).compile(validRequest);
  assert.equal(plan.plannerReadiness, "READY_FOR_EXISTING_PLANNER");
  assert.equal(plan.photoshopProductionReadiness, "READY_FOR_PHOTOSHOP_PRODUCTION");
  assert.equal(plan.pressReadiness, "READY_WITH_DESIGN_FACTORY_DEFAULTS");
  assert.equal(plan.productionDefaults.source, "DESIGN_FACTORY_DEFAULT");
  assert.deepEqual(plan.blockers.press, []);
  assert.equal(plan.stages.length, 11);
  assert.deepEqual(plan.stages.map(stage => stage.sequence), [...Array(11).keys()]);
  assert.equal(JSON.stringify(plan).includes("agentId"), false);
  assert.ok(plan.stages.some(stage => stage.capabilityContributions.some(item => item.resource_id === "taste-skill" && item.executionAuthority === "NONE")));
  assert.equal(plan.stages.some(stage => stage.capabilityContributions.some(item => item.resource_id === "impeccable")), false);
  assert.match(plan.evidenceHash, /^[a-f0-9]{64}$/);
  const repeated = await new DesignPracticeProtocol({ resourceRegistry }).compile(validRequest);
  assert.equal(repeated.evidenceHash, plan.evidenceHash);
});

test("uses production defaults without waiting for printer-specific settings", async () => {
  const pending = await new DesignPracticeProtocol({ resourceRegistry }).compile(validRequest);
  assert.equal(pending.photoshopProductionReadiness, "READY_FOR_PHOTOSHOP_PRODUCTION");
  assert.equal(pending.pressReadiness, "READY_WITH_DESIGN_FACTORY_DEFAULTS");
  assert.equal(pending.productionDefaults.targetColorSpace, "CMYK");
  const confirmed = await new DesignPracticeProtocol({ resourceRegistry }).compile({ ...validRequest, printerProfileStatus: "CONFIRMED" });
  assert.equal(confirmed.pressReadiness, "READY_FOR_PRESS_PREFLIGHT");
  assert.equal(confirmed.productionDefaults.source, "EXTERNAL_CONFIRMED");
});

test("fills standard large-format defaults instead of pausing production", async () => {
  const plan = await new DesignPracticeProtocol({ resourceRegistry }).compile({
    ...validRequest,
    physicalSpec: { widthMm: 640, heightMm: 1440 },
    viewing: {},
    printerProfileStatus: undefined
  });
  assert.equal(plan.photoshopProductionReadiness, "READY_FOR_PHOTOSHOP_PRODUCTION");
  assert.equal(plan.pressReadiness, "READY_WITH_DESIGN_FACTORY_DEFAULTS");
  assert.deepEqual(plan.productionDefaults, {
    source: "DESIGN_FACTORY_DEFAULT",
    resolutionPpi: 150,
    bleedMm: 0,
    targetColorSpace: "CMYK_FOGRA39",
    viewingDistanceMeters: 3
  });
});

test("requires only physical dimensions when standard production defaults can be applied", async () => {
  const plan = await new DesignPracticeProtocol({ resourceRegistry }).compile({ ...validRequest, physicalSpec: null, viewing: {} });
  assert.equal(plan.photoshopProductionReadiness, "BLOCKED_PENDING_EVIDENCE");
  assert.ok(plan.blockers.photoshopProduction.includes("PHYSICAL_DIMENSIONS_REQUIRED"));
  assert.equal(plan.blockers.photoshopProduction.includes("VIEWING_DISTANCE_REQUIRED"), false);
});

test("turns Photoshop choices into intent, rollback and QA cards", async () => {
  const plan = await new DesignPracticeProtocol({ resourceRegistry }).compile(validRequest);
  const type = plan.photoshopToolIntentCards.find(card => card.intentId === "TYPOGRAPHY");
  assert.ok(type.capabilities.includes("text_layer"));
  assert.ok(type.qa.includes("no_horizontal_distortion"));
  assert.ok(type.prohibited.includes("ai_baked_text"));
  assert.equal(plan.innovationContract.conceptRange[0], 2);
  assert.deepEqual(plan.reviewModel.separateGates, ["CONCEPT_REVIEW", "VISUAL_REVIEW", "TECHNICAL_PREFLIGHT"]);
});

test("includes Impeccable only for UI surfaces and never grants execution authority", async () => {
  const plan = await new DesignPracticeProtocol({ resourceRegistry }).compile({ ...validRequest, surfaceIsUi: true });
  const contribution = plan.stages.flatMap(stage => stage.capabilityContributions).find(item => item.resource_id === "impeccable");
  assert.equal(contribution.status, "READY_READ_ONLY");
  assert.equal(contribution.executionAuthority, "NONE");
  assert.equal(contribution.scope, "ui_only_not_photoshop_or_print");
});

test("fails closed for unsupported Photoshop intent", async () => {
  await assert.rejects(() => new DesignPracticeProtocol({ resourceRegistry }).compile({ ...validRequest, photoshopIntents: ["MAGIC_FILTER"] }), /PHOTOSHOP_INTENT_UNSUPPORTED/);
});
