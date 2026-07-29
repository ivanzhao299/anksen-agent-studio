import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildGaugeDrivenCalibrationPlan,
  buildInverseRenderFidelityPlan,
  buildOrbitReferenceCalibrationPlan,
  buildParametricCharacterExecutionPlan,
  buildModelingExecutionPlan,
  evaluateModelingEvidence,
  GAUGE_CALIBRATION_STEPS,
  INVERSE_RENDER_FIDELITY_STEPS,
  MODELING_STEPS,
  ORBIT_CALIBRATION_STEPS,
  PARAMETRIC_MODELING_STEPS,
  validateGaugeDrivenCalibration,
  validateInverseRenderFidelityWorkflow,
  validateOrbitReferenceCalibration,
  validateParametricCharacterWorkflow,
  validateModelingWorkflow
} from "../lib/3d-modeling-domain.mjs";

const example = JSON.parse(
  await readFile(
    new URL("../examples/character-print-modeling.example.json", import.meta.url),
    "utf8"
  )
);
const parametricExample = JSON.parse(
  await readFile(
    new URL("../examples/huihui-parametric-character.example.json", import.meta.url),
    "utf8"
  )
);
const orbitExample = JSON.parse(
  await readFile(
    new URL("../examples/huihui-ai-orbit-calibration.example.json", import.meta.url),
    "utf8"
  )
);
const inverseRenderExample = JSON.parse(
  await readFile(
    new URL(
      "../examples/huihui-v15-inverse-render-fidelity.example.json",
      import.meta.url
    ),
    "utf8"
  )
);
const gaugeCalibrationExample = JSON.parse(
  await readFile(
    new URL(
      "../examples/huihui-v15-gauge-calibration.example.json",
      import.meta.url
    ),
    "utf8"
  )
);

test("validates a bounded standalone 3D modeling contract", () => {
  assert.equal(validateModelingWorkflow(example).domain, "3D_MODELING");
  assert.throws(
    () => validateModelingWorkflow({ ...example, sourceMesh: "../secret.glb" }),
    error => error.code === "MODELING_PATH_INVALID"
  );
  assert.throws(
    () => validateModelingWorkflow({ ...example, surfaceSubdivisionLevel: 4 }),
    error => error.code === "MODELING_GEOMETRY_LIMIT_INVALID"
  );
});

test("delegates execution without creating duplicate orchestration primitives", () => {
  const plan = buildModelingExecutionPlan(example);
  assert.deepEqual(plan.steps, MODELING_STEPS);
  assert.equal(plan.skillRequest.skillType, "character_3d_print_refinement");
  assert.equal(plan.skillRequest.surfaceSubdivisionLevel, 2);
  assert.equal(plan.skillRequest.surfaceMethod, "voxel");
  assert.equal(plan.skillRequest.surfaceProfile, "feature-preserving");
  assert.equal(plan.skillRequest.featureAngleDegrees, 60);
  assert.equal(plan.skillRequest.featureProtectionRings, 1);
  assert.equal(plan.skillRequest.semanticRegions.length, 4);
  assert.equal(plan.executionBoundary.delegatesToExistingSkillRouter, true);
  assert.equal(plan.executionBoundary.createsNewPlanner, false);
  assert.equal(plan.executionBoundary.createsNewStateMachine, false);
  assert.deepEqual(plan.gates, [
    "GEOMETRY",
    "SILHOUETTE",
    "SURFACE_QUALITY",
    "SEMANTIC_PARTITION",
    "DETAIL_CONFORMANCE",
    "VISUAL_OWNER_REVIEW",
    "SLICER_REVIEW",
    "PHYSICAL_PROOF"
  ]);
});

test("release evidence is fail closed", () => {
  assert.equal(evaluateModelingEvidence(example, {}).status, "HOLD");
  assert.equal(
    evaluateModelingEvidence(example, {
      geometry: "PASS",
      silhouette: "PASS",
      surfaceQuality: "PASS",
      semanticPartition: "PASS",
      detailConformance: "PASS",
      visualReview: "PASS",
      slicerReview: "PASS",
      physicalProof: "PASS"
    }).status,
    "PASS"
  );
});

test("validates geometry-first semantic parts and rejects voxel master authority", () => {
  assert.equal(
    validateParametricCharacterWorkflow(parametricExample).constructionMode,
    "GEOMETRY_FIRST"
  );
  assert.throws(
    () =>
      validateParametricCharacterWorkflow({
        ...parametricExample,
        assembly: {
          ...parametricExample.assembly,
          forbidGlobalVoxelMaster: false
        }
      }),
    error => error.code === "PARAMETRIC_MODELING_ASSEMBLY_INVALID"
  );
});

test("delegates the geometry-first build to the existing Skill Router", () => {
  const plan = buildParametricCharacterExecutionPlan(parametricExample);
  assert.deepEqual(plan.steps, PARAMETRIC_MODELING_STEPS);
  assert.equal(plan.skillRequest.operation, "BUILD_PARAMETRIC_PRINTABLE");
  assert.equal(plan.skillRequest.forbidGlobalVoxelMaster, true);
  assert.equal(plan.providerRole.meshy, "OPTIONAL_SHAPE_AND_DETAIL_REFERENCE");
  assert.equal(plan.providerRole.authoritativeMaster, false);
  assert.equal(plan.executionBoundary.createsNewWorker, false);
});

test("validates a non-metric AI orbit calibration contract", () => {
  assert.equal(
    validateOrbitReferenceCalibration(orbitExample).calibrationMode,
    "AI_ORBIT_REFERENCE_CALIBRATION"
  );
  assert.throws(
    () =>
      validateOrbitReferenceCalibration({
        ...orbitExample,
        fitting: {
          ...orbitExample.fitting,
          automaticMasterOverwrite: true
        }
      }),
    error => error.code === "ORBIT_CALIBRATION_FITTING_INVALID"
  );
});

test("uses AI orbit frames as weighted observations without adding orchestration", () => {
  const plan = buildOrbitReferenceCalibrationPlan(orbitExample);
  assert.deepEqual(plan.steps, ORBIT_CALIBRATION_STEPS);
  assert.equal(plan.skillRequest.operation, "CALIBRATE_FROM_AI_ORBIT");
  assert.equal(
    plan.observationAuthority.generatedOrbitFrames,
    "NON_METRIC_CONFIDENCE_WEIGHTED_OBSERVATIONS"
  );
  assert.equal(plan.observationAuthority.automaticMasterOverwrite, false);
  assert.equal(plan.executionBoundary.createsNewRuntime, false);
});

test("validates a high-resolution inverse-render contract with fail-closed promotion", () => {
  const workflow = validateInverseRenderFidelityWorkflow(inverseRenderExample);
  assert.equal(workflow.baselineVersion, "refined-v15-modeling-domain");
  assert.equal(workflow.viewAuthority.generatedViewsAreMetric, false);
  assert.throws(
    () =>
      validateInverseRenderFidelityWorkflow({
        ...inverseRenderExample,
        promotion: {
          ...inverseRenderExample.promotion,
          automaticMasterOverwrite: true
        }
      }),
    error => error.code === "INVERSE_RENDER_FIDELITY_PROMOTION_INVALID"
  );
});

test("keeps v15 as the baseline and delegates fidelity evaluation to the existing router", () => {
  const plan = buildInverseRenderFidelityPlan(inverseRenderExample);
  assert.deepEqual(plan.steps, INVERSE_RENDER_FIDELITY_STEPS);
  assert.equal(plan.skillRequest.operation, "EVALUATE_INVERSE_RENDER_FIDELITY");
  assert.equal(plan.authority.geometryBaseline, "refined-v15-modeling-domain");
  assert.equal(plan.authority.automaticMasterOverwrite, false);
  assert.equal(plan.executionBoundary.createsNewRuntime, false);
});

test("validates gauge-driven geometry and rejects global master mutation", () => {
  const workflow = validateGaugeDrivenCalibration(gaugeCalibrationExample);
  assert.equal(workflow.baselineVersion, "refined-v15-modeling-domain");
  assert.match(workflow.baselineBlend, /\.blend$/);
  assert.equal(workflow.viewAuthority.generatedViewsAreMetric, false);
  assert.ok(workflow.semanticProbes.some(probe => probe.id === "hand-rig"));
  assert.deepEqual(
    workflow.semanticProbes.find(probe => probe.id === "arm-rig")
      .frontAnchorPixels["left-elbow"],
    [235, 650]
  );
  assert.throws(
    () =>
      validateGaugeDrivenCalibration({
        ...gaugeCalibrationExample,
        fitting: {
          ...gaugeCalibrationExample.fitting,
          forbidGlobalVoxelMaster: false
        }
      }),
    error => error.code === "GAUGE_CALIBRATION_FITTING_INVALID"
  );
  assert.throws(
    () =>
      validateGaugeDrivenCalibration({
        ...gaugeCalibrationExample,
        semanticProbes: gaugeCalibrationExample.semanticProbes.map((probe, index) =>
          index === 0
            ? { ...probe, frontAnchorPixels: { unknown: [1, 2] } }
            : probe
        )
      }),
    error => error.code === "GAUGE_CALIBRATION_PROBE_INVALID"
  );
});

test("creates a local semantic patch plan without new orchestration primitives", () => {
  const plan = buildGaugeDrivenCalibrationPlan(gaugeCalibrationExample);
  assert.deepEqual(plan.steps, GAUGE_CALIBRATION_STEPS);
  assert.equal(plan.skillRequest.operation, "CALIBRATE_WITH_MULTIVIEW_GAUGES");
  assert.equal(plan.patchPolicy.scope, "SEMANTIC_PART_LOCAL_PATCHES");
  assert.equal(plan.patchPolicy.preservePartBoundaries, true);
  assert.equal(plan.authority.globalVoxelMasterAllowed, false);
  assert.equal(plan.authority.automaticMasterOverwrite, false);
  assert.equal(plan.executionBoundary.createsNewRuntime, false);
});
