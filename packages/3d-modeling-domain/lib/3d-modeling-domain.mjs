const safeId = /^[a-z0-9][a-z0-9._-]+$/i;
const safeRelativePath = value =>
  typeof value === "string" &&
  value.length > 0 &&
  !value.startsWith("/") &&
  !value.includes("..") &&
  !/(^|\/)(?:\.env(?:\.|$)|\.ssh(?:\/|$)|\.git(?:\/|$))/i.test(value);
const risks = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const surfaceMethods = new Set(["voxel", "catmull-clark", "relax-only"]);
const surfaceProfiles = new Set(["uniform", "feature-preserving"]);
const semanticClasses = new Set([
  "ORGANIC_SHELL",
  "HARD_SURFACE",
  "JOINT_INTERFACE",
  "RELIEF",
  "MATERIAL_BOUNDARY"
]);
const semanticTreatments = new Set(["FAIR", "PRESERVE", "REBUILD", "SEPARATE"]);
const shapeFamilies = new Set([
  "ELLIPSOID",
  "ROUNDED_PRISM",
  "DOME",
  "CYLINDER",
  "CAPSULE",
  "CURVE_TUBE",
  "RELIEF",
  "COMPOSITE"
]);
const semanticRoles = new Set([
  "BODY",
  "FACE",
  "HELMET",
  "EAR",
  "ARM",
  "HAND",
  "LEG",
  "BOOT",
  "BRANDING",
  "BASE"
]);
const joinPolicies = new Set([
  "KEEP_SEPARATE",
  "CONTROLLED_OVERLAP",
  "EXACT_BOOLEAN_UNION",
  "RELIEF_ATTACH"
]);
const hardEdgePolicies = new Set(["PRESERVE", "CONTROLLED_FILLET", "SMOOTH_ORGANIC"]);
const gaugePrimitiveFamilies = new Set([
  "SUPERELLIPSOID",
  "BEZIER_PROFILE",
  "ROUNDED_PRISM",
  "DOME",
  "CYLINDER",
  "CAPSULE",
  "COMPOSITE"
]);
const gaugeInterfaceOperations = new Set([
  "KEEP_SEPARATE",
  "CONTROLLED_OVERLAP",
  "EXACT_BOOLEAN_UNION",
  "LOCAL_BLEND_PATCH",
  "CONTROLLED_FILLET"
]);

export const MODELING_STEPS = Object.freeze([
  "REFERENCE_INGEST",
  "MULTIVIEW_IDENTITY_LOCK",
  "PROVIDER_RECONSTRUCTION",
  "CURVED_SURFACE_REFINEMENT",
  "DETAIL_SURFACE_CONFORMANCE",
  "TOPOLOGY_AND_PRINT_QA",
  "VISUAL_SLICER_PHYSICAL_RELEASE_EVIDENCE"
]);

export const PARAMETRIC_MODELING_STEPS = Object.freeze([
  "REFERENCE_AND_PROPORTION_LOCK",
  "SEMANTIC_PART_DECOMPOSITION",
  "PARAMETRIC_PRIMITIVE_CONSTRUCTION",
  "PART_LEVEL_SURFACE_REFINEMENT",
  "CONTROLLED_ASSEMBLY",
  "MULTIVIEW_AND_INTERFACE_QA",
  "EXACT_MANUFACTURING_UNION",
  "SLICER_AND_PHYSICAL_RELEASE_EVIDENCE"
]);

export const ORBIT_CALIBRATION_STEPS = Object.freeze([
  "AUTHORITATIVE_FRONT_LOCK",
  "GOVERNED_AI_ORBIT_GENERATION",
  "ANGLE_NORMALIZED_FRAME_EXTRACTION",
  "FRAME_ACCEPTANCE_AND_DRIFT_REJECTION",
  "SILHOUETTE_AND_FEATURE_OBSERVATION",
  "CONFIDENCE_WEIGHTED_PARAMETRIC_FITTING",
  "GEOMETRY_OWNER_REVIEW",
  "DETAIL_AND_MATERIAL_CALIBRATION"
]);

export const INVERSE_RENDER_FIDELITY_STEPS = Object.freeze([
  "V15_GEOMETRY_BASELINE_LOCK",
  "AUTHORITATIVE_REFERENCE_NORMALIZATION",
  "MULTIVIEW_INVERSE_RENDER",
  "SILHOUETTE_AND_EDGE_ALIGNMENT",
  "MULTISCALE_STRUCTURE_ALIGNMENT",
  "MATERIAL_REGION_ALIGNMENT",
  "SEMANTIC_REGION_FIDELITY_REVIEW",
  "FAIL_CLOSED_CANDIDATE_PROMOTION"
]);

export const GAUGE_CALIBRATION_STEPS = Object.freeze([
  "REFERENCE_SCALE_LOCK",
  "ORTHOGRAPHIC_VIEW_REGISTRATION",
  "DATUM_AND_AXIS_LOCK",
  "SEMANTIC_PROBE_CALIBRATION",
  "PRIMITIVE_AND_BEZIER_FITTING",
  "INTERFACE_TOLERANCE_SOLVE",
  "LOCAL_GEOMETRY_PATCH",
  "MULTIVIEW_REPROJECTION_QA"
]);

export class ModelingDomainError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "ModelingDomainError";
    this.code = code;
  }
}

export function validateModelingWorkflow(input) {
  const workflow = structuredClone(input ?? {});
  if (
    workflow.schemaVersion !== 1 ||
    workflow.domain !== "3D_MODELING" ||
    !safeId.test(workflow.workflowId ?? "") ||
    !safeId.test(workflow.assetId ?? "")
  ) {
    throw new ModelingDomainError("MODELING_IDENTITY_INVALID");
  }
  for (const field of ["sourceMesh", "referenceManifest", "outputRoot"]) {
    if (!safeRelativePath(workflow[field])) {
      throw new ModelingDomainError("MODELING_PATH_INVALID", field);
    }
  }
  if (
    !Number.isFinite(workflow.targetHeightMm) ||
    workflow.targetHeightMm < 20 ||
    workflow.targetHeightMm > 1000 ||
    !Number.isInteger(workflow.surfaceSubdivisionLevel) ||
    workflow.surfaceSubdivisionLevel < 0 ||
    workflow.surfaceSubdivisionLevel > 2 ||
    !surfaceMethods.has(workflow.surfaceMethod) ||
    !surfaceProfiles.has(workflow.surfaceProfile) ||
    !Number.isFinite(workflow.featureAngleDegrees) ||
    workflow.featureAngleDegrees < 20 ||
    workflow.featureAngleDegrees > 120 ||
    !Number.isInteger(workflow.featureProtectionRings) ||
    workflow.featureProtectionRings < 0 ||
    workflow.featureProtectionRings > 5 ||
    !Array.isArray(workflow.semanticRegions) ||
    workflow.semanticRegions.length === 0 ||
    workflow.semanticRegions.some(
      region =>
        !safeId.test(region.id ?? "") ||
        !semanticClasses.has(region.semanticClass) ||
        !semanticTreatments.has(region.treatment) ||
        typeof region.ownerReviewRequired !== "boolean"
    )
  ) {
    throw new ModelingDomainError("MODELING_GEOMETRY_LIMIT_INVALID");
  }
  if (
    !risks.has(workflow.riskLevel) ||
    !Array.isArray(workflow.constraints) ||
    workflow.constraints.length === 0 ||
    !Array.isArray(workflow.acceptanceCriteria) ||
    workflow.acceptanceCriteria.length === 0
  ) {
    throw new ModelingDomainError("MODELING_POLICY_INVALID");
  }
  return Object.freeze(workflow);
}

export function validateParametricCharacterWorkflow(input) {
  const workflow = structuredClone(input ?? {});
  if (
    workflow.schemaVersion !== 1 ||
    workflow.domain !== "3D_MODELING" ||
    workflow.constructionMode !== "GEOMETRY_FIRST" ||
    !safeId.test(workflow.workflowId ?? "") ||
    !safeId.test(workflow.assetId ?? "")
  ) {
    throw new ModelingDomainError("PARAMETRIC_MODELING_IDENTITY_INVALID");
  }
  for (const field of ["referenceManifest", "outputRoot"]) {
    if (!safeRelativePath(workflow[field])) {
      throw new ModelingDomainError("PARAMETRIC_MODELING_PATH_INVALID", field);
    }
  }
  const geometry = workflow.geometrySpec;
  const requiredGeometry = ["body", "face", "helmet", "ears", "arms", "hands", "legs", "boots", "branding"];
  if (
    !Number.isFinite(workflow.targetHeightMm) ||
    workflow.targetHeightMm < 20 ||
    workflow.targetHeightMm > 1000 ||
    geometry?.unit !== "MILLIMETER" ||
    geometry?.coordinateSystem !== "BLENDER_Z_UP_FRONT_NEGATIVE_Y" ||
    requiredGeometry.some(key => !shapeFamilies.has(geometry?.[key]?.shapeFamily))
  ) {
    throw new ModelingDomainError("PARAMETRIC_MODELING_GEOMETRY_INVALID");
  }
  if (
    !Array.isArray(workflow.parts) ||
    workflow.parts.length < 8 ||
    new Set(workflow.parts.map(part => part.id)).size !== workflow.parts.length ||
    workflow.parts.some(
      part =>
        !safeId.test(part.id ?? "") ||
        !semanticRoles.has(part.semanticRole) ||
        !shapeFamilies.has(part.shapeFamily) ||
        !joinPolicies.has(part.joinPolicy) ||
        !hardEdgePolicies.has(part.hardEdgePolicy) ||
        typeof part.materialClass !== "string" ||
        part.materialClass.length === 0
    )
  ) {
    throw new ModelingDomainError("PARAMETRIC_MODELING_PARTS_INVALID");
  }
  const partIds = new Set(workflow.parts.map(part => part.id));
  if (workflow.parts.some(part => part.parent !== null && !partIds.has(part.parent))) {
    throw new ModelingDomainError("PARAMETRIC_MODELING_PARENT_INVALID");
  }
  if (
    workflow.assembly?.masterMode !== "SEMANTIC_PART_ASSEMBLY" ||
    workflow.assembly?.forbidGlobalVoxelMaster !== true ||
    !["DEFERRED", "EXACT_BOOLEAN", "CONTROLLED_HYBRID"].includes(
      workflow.assembly?.manufacturingUnion
    ) ||
    !Number.isFinite(workflow.assembly?.minimumJointOverlapMm) ||
    !Number.isFinite(workflow.assembly?.booleanToleranceMm)
  ) {
    throw new ModelingDomainError("PARAMETRIC_MODELING_ASSEMBLY_INVALID");
  }
  if (
    !risks.has(workflow.riskLevel) ||
    !Array.isArray(workflow.constraints) ||
    workflow.constraints.length === 0 ||
    !Array.isArray(workflow.acceptanceCriteria) ||
    workflow.acceptanceCriteria.length === 0
  ) {
    throw new ModelingDomainError("PARAMETRIC_MODELING_POLICY_INVALID");
  }
  return Object.freeze(workflow);
}

export function validateOrbitReferenceCalibration(input) {
  const workflow = structuredClone(input ?? {});
  if (
    workflow.schemaVersion !== 1 ||
    workflow.domain !== "3D_MODELING" ||
    workflow.calibrationMode !== "AI_ORBIT_REFERENCE_CALIBRATION" ||
    !safeId.test(workflow.workflowId ?? "") ||
    !safeId.test(workflow.assetId ?? "")
  ) {
    throw new ModelingDomainError("ORBIT_CALIBRATION_IDENTITY_INVALID");
  }
  for (const field of [
    "authoritativeFront",
    "referenceManifest",
    "parametricSpec",
    "outputRoot"
  ]) {
    if (!safeRelativePath(workflow[field])) {
      throw new ModelingDomainError("ORBIT_CALIBRATION_PATH_INVALID", field);
    }
  }
  if (
    workflow.provider !== "kling-ai" ||
    ![5, 10].includes(workflow.orbit?.durationSeconds) ||
    workflow.orbit?.expectedDegrees !== 360 ||
    workflow.orbit?.fixedCamera !== true ||
    workflow.orbit?.neutralPose !== true ||
    workflow.orbit?.orthographicPreferred !== true ||
    !Array.isArray(workflow.orbit?.sampleAngles) ||
    workflow.orbit.sampleAngles.length < 8 ||
    new Set(workflow.orbit.sampleAngles).size !== workflow.orbit.sampleAngles.length ||
    workflow.orbit.sampleAngles.some(
      angle => !Number.isInteger(angle) || angle < 0 || angle >= 360
    )
  ) {
    throw new ModelingDomainError("ORBIT_CALIBRATION_ORBIT_INVALID");
  }
  const acceptance = workflow.frameAcceptance;
  if (
    !Number.isFinite(acceptance?.minimumForegroundRatio) ||
    !Number.isFinite(acceptance?.maximumForegroundRatio) ||
    acceptance.minimumForegroundRatio >= acceptance.maximumForegroundRatio ||
    !Number.isFinite(acceptance?.maximumHeightDriftRatio) ||
    acceptance.rejectIdentityDrift !== true ||
    acceptance.rejectBrandingMutation !== true ||
    acceptance.rejectAnatomyMutation !== true
  ) {
    throw new ModelingDomainError("ORBIT_CALIBRATION_ACCEPTANCE_INVALID");
  }
  const fitting = workflow.fitting;
  if (
    fitting?.geometryAuthority !== "PARAMETRIC_SEMANTIC_ASSEMBLY" ||
    fitting?.objective !== "CONFIDENCE_WEIGHTED_MULTI_VIEW_REPROJECTION" ||
    fitting?.materialTrackingAfterGeometryLock !== true ||
    fitting?.automaticMasterOverwrite !== false ||
    !Number.isFinite(fitting?.authoritativeFrontWeight) ||
    !Number.isFinite(fitting?.generatedFrameWeight) ||
    fitting.authoritativeFrontWeight <= fitting.generatedFrameWeight
  ) {
    throw new ModelingDomainError("ORBIT_CALIBRATION_FITTING_INVALID");
  }
  if (
    !risks.has(workflow.riskLevel) ||
    !Array.isArray(workflow.constraints) ||
    workflow.constraints.length === 0 ||
    !Array.isArray(workflow.acceptanceCriteria) ||
    workflow.acceptanceCriteria.length === 0
  ) {
    throw new ModelingDomainError("ORBIT_CALIBRATION_POLICY_INVALID");
  }
  return Object.freeze(workflow);
}

export function validateInverseRenderFidelityWorkflow(input) {
  const workflow = structuredClone(input ?? {});
  if (
    workflow.schemaVersion !== 1 ||
    workflow.domain !== "3D_MODELING" ||
    workflow.evaluationMode !== "HIGH_RESOLUTION_INVERSE_RENDER_ALIGNMENT" ||
    !safeId.test(workflow.workflowId ?? "") ||
    !safeId.test(workflow.assetId ?? "") ||
    typeof workflow.baselineVersion !== "string" ||
    workflow.baselineVersion.length === 0
  ) {
    throw new ModelingDomainError("INVERSE_RENDER_FIDELITY_IDENTITY_INVALID");
  }
  for (const field of [
    "referenceManifest",
    "candidateRenderRoot",
    "candidateSilhouetteRoot",
    "outputRoot"
  ]) {
    if (!safeRelativePath(workflow[field])) {
      throw new ModelingDomainError("INVERSE_RENDER_FIDELITY_PATH_INVALID", field);
    }
  }
  if (
    workflow.viewAuthority?.generatedViewsAreMetric !== false ||
    !Number.isFinite(workflow.viewAuthority?.authoritativeFrontWeight) ||
    !Number.isFinite(workflow.viewAuthority?.generatedViewWeight) ||
    workflow.viewAuthority.authoritativeFrontWeight <=
      workflow.viewAuthority.generatedViewWeight
  ) {
    throw new ModelingDomainError("INVERSE_RENDER_FIDELITY_AUTHORITY_INVALID");
  }
  if (
    workflow.metrics?.silhouetteIou !== true ||
    workflow.metrics?.edgeChamferSimilarity !== true ||
    workflow.metrics?.multiscaleStructuralSimilarity !== true ||
    workflow.metrics?.colorMaterialSimilarity !== true ||
    !Array.isArray(workflow.semanticRegions) ||
    workflow.semanticRegions.length < 5 ||
    new Set(workflow.semanticRegions.map(region => region.id)).size !==
      workflow.semanticRegions.length ||
    workflow.semanticRegions.some(
      region =>
        !safeId.test(region.id ?? "") ||
        !Array.isArray(region.box) ||
        region.box.length !== 4 ||
        region.box.some(value => !Number.isFinite(value) || value < 0 || value > 1) ||
        region.box[0] >= region.box[2] ||
        region.box[1] >= region.box[3] ||
        !Number.isFinite(region.weight) ||
        region.weight <= 0
    )
  ) {
    throw new ModelingDomainError("INVERSE_RENDER_FIDELITY_METRICS_INVALID");
  }
  const targets = workflow.promotion?.targets;
  if (
    workflow.promotion?.automaticMasterOverwrite !== false ||
    workflow.promotion?.requireNoAuthoritativeFrontRegression !== true ||
    workflow.promotion?.requireAllSemanticRegions !== true ||
    !targets ||
    Object.keys(targets).length < 5 ||
    Object.values(targets).some(
      value => !Number.isFinite(value) || value < 0 || value > 1
    )
  ) {
    throw new ModelingDomainError("INVERSE_RENDER_FIDELITY_PROMOTION_INVALID");
  }
  if (
    !risks.has(workflow.riskLevel) ||
    !Array.isArray(workflow.constraints) ||
    workflow.constraints.length === 0 ||
    !Array.isArray(workflow.acceptanceCriteria) ||
    workflow.acceptanceCriteria.length === 0
  ) {
    throw new ModelingDomainError("INVERSE_RENDER_FIDELITY_POLICY_INVALID");
  }
  return Object.freeze(workflow);
}

export function validateGaugeDrivenCalibration(input) {
  const workflow = structuredClone(input ?? {});
  if (
    workflow.schemaVersion !== 1 ||
    workflow.domain !== "3D_MODELING" ||
    workflow.calibrationMode !== "GAUGE_DRIVEN_MULTIVIEW_GEOMETRY" ||
    !safeId.test(workflow.workflowId ?? "") ||
    !safeId.test(workflow.assetId ?? "") ||
    typeof workflow.baselineVersion !== "string" ||
    workflow.baselineVersion.length === 0
  ) {
    throw new ModelingDomainError("GAUGE_CALIBRATION_IDENTITY_INVALID");
  }
  for (const field of [
    "baselineMesh",
    "baselineBlend",
    "authoritativeFront",
    "referenceManifest",
    "observationReport",
    "parametricSpec",
    "outputRoot"
  ]) {
    if (!safeRelativePath(workflow[field])) {
      throw new ModelingDomainError("GAUGE_CALIBRATION_PATH_INVALID", field);
    }
  }
  if (
    !Number.isFinite(workflow.targetHeightMm) ||
    workflow.targetHeightMm < 20 ||
    workflow.targetHeightMm > 1000 ||
    workflow.coordinateSystem !== "BLENDER_Z_UP_FRONT_NEGATIVE_Y" ||
    workflow.datums?.unit !== "MILLIMETER" ||
    workflow.datums?.groundPlane !== "Z=0" ||
    workflow.datums?.centerPlane !== "X=0" ||
    workflow.datums?.frontPlane !== "Y=0" ||
    workflow.datums?.lockGround !== true ||
    workflow.datums?.lockCenterline !== true ||
    workflow.datums?.lockScale !== true
  ) {
    throw new ModelingDomainError("GAUGE_CALIBRATION_DATUM_INVALID");
  }
  const authority = workflow.viewAuthority;
  if (
    authority?.authoritativeFront !== "METRIC_IDENTITY_AND_XZ_GAUGE" ||
    authority?.generatedViewsAreMetric !== false ||
    !Array.isArray(authority?.requiredAngles) ||
    ![0, 90, 180, 270].every(angle => authority.requiredAngles.includes(angle)) ||
    !Number.isFinite(authority?.minimumDepthConfidence) ||
    authority.minimumDepthConfidence <= 0 ||
    authority.minimumDepthConfidence > 1
  ) {
    throw new ModelingDomainError("GAUGE_CALIBRATION_AUTHORITY_INVALID");
  }
  if (
    !Array.isArray(workflow.gaugeProfiles) ||
    workflow.gaugeProfiles.length === 0 ||
    workflow.gaugeProfiles.some(
      profile =>
        !safeId.test(profile.id ?? "") ||
        !safeId.test(profile.semanticPart ?? "") ||
        !Array.isArray(profile.levels) ||
        profile.levels.length < 3 ||
        profile.levels.some(level => !Number.isFinite(level) || level < 0 || level > 1)
    )
  ) {
    throw new ModelingDomainError("GAUGE_CALIBRATION_PROFILE_INVALID");
  }
  if (
    !Array.isArray(workflow.semanticProbes) ||
    workflow.semanticProbes.length < 5 ||
    new Set(workflow.semanticProbes.map(probe => probe.id)).size !==
      workflow.semanticProbes.length ||
    workflow.semanticProbes.some(
      probe =>
        !safeId.test(probe.id ?? "") ||
        !semanticRoles.has(probe.semanticRole) ||
        !gaugePrimitiveFamilies.has(probe.primitiveFamily) ||
        !safeId.test(probe.observationPart ?? "") ||
        !Array.isArray(probe.anchorNames) ||
        probe.anchorNames.length < 3 ||
        !Array.isArray(probe.requiredViews) ||
        !probe.requiredViews.includes("front") ||
        (probe.frontAnchorPixels !== undefined &&
          (probe.frontAnchorPixels === null ||
            typeof probe.frontAnchorPixels !== "object" ||
            Object.entries(probe.frontAnchorPixels).some(
              ([name, point]) =>
                !probe.anchorNames.includes(name) ||
                (point !== null &&
                  (!Array.isArray(point) ||
                    point.length !== 2 ||
                    point.some(value => !Number.isFinite(value) || value < 0)))
            ))) ||
        typeof probe.curveControlPoints !== "boolean" ||
        typeof probe.ownerReviewRequired !== "boolean"
    )
  ) {
    throw new ModelingDomainError("GAUGE_CALIBRATION_PROBE_INVALID");
  }
  if (
    !Array.isArray(workflow.interfaces) ||
    workflow.interfaces.length === 0 ||
    workflow.interfaces.some(
      item =>
        !safeId.test(item.id ?? "") ||
        !safeId.test(item.parentPart ?? "") ||
        !safeId.test(item.childPart ?? "") ||
        !gaugeInterfaceOperations.has(item.operation) ||
        !Number.isFinite(item.toleranceMm) ||
        item.toleranceMm <= 0 ||
        item.preserveBoundary !== true
    )
  ) {
    throw new ModelingDomainError("GAUGE_CALIBRATION_INTERFACE_INVALID");
  }
  const fitting = workflow.fitting;
  if (
    fitting?.geometryAuthority !== "SEMANTIC_PARAMETRIC_ASSEMBLY" ||
    fitting?.profileMethod !== "PRIMITIVE_PLUS_BEZIER_GAUGE_FIT" ||
    fitting?.preserveSemanticParts !== true ||
    fitting?.forbidGlobalVoxelMaster !== true ||
    fitting?.automaticMasterOverwrite !== false ||
    fitting?.manufacturingUnion !== "DEFERRED"
  ) {
    throw new ModelingDomainError("GAUGE_CALIBRATION_FITTING_INVALID");
  }
  if (
    !risks.has(workflow.riskLevel) ||
    !Array.isArray(workflow.constraints) ||
    workflow.constraints.length === 0 ||
    !Array.isArray(workflow.acceptanceCriteria) ||
    workflow.acceptanceCriteria.length === 0
  ) {
    throw new ModelingDomainError("GAUGE_CALIBRATION_POLICY_INVALID");
  }
  return Object.freeze(workflow);
}

export function buildModelingExecutionPlan(input) {
  const workflow = validateModelingWorkflow(input);
  return Object.freeze({
    schemaVersion: 1,
    domain: "3D_MODELING",
    workflowId: workflow.workflowId,
    assetId: workflow.assetId,
    steps: MODELING_STEPS,
    executionBoundary: {
      delegatesToExistingSkillRouter: true,
      createsNewPlanner: false,
      createsNewScheduler: false,
      createsNewWorker: false,
      createsNewStateMachine: false
    },
    skillRequest: {
      skillType: "character_3d_print_refinement",
      operation: "REFINE_PRINTABLE",
      assetId: workflow.assetId,
      meshPath: workflow.sourceMesh,
      manifestPath: workflow.referenceManifest,
      outputRoot: workflow.outputRoot,
      targetHeightMm: workflow.targetHeightMm,
      surfaceSubdivisionLevel: workflow.surfaceSubdivisionLevel,
      surfaceMethod: workflow.surfaceMethod,
      surfaceProfile: workflow.surfaceProfile,
      featureAngleDegrees: workflow.featureAngleDegrees,
      featureProtectionRings: workflow.featureProtectionRings,
      semanticRegions: workflow.semanticRegions,
      risk: workflow.riskLevel
    },
    gates: [
      "GEOMETRY",
      "SILHOUETTE",
      "SURFACE_QUALITY",
      "SEMANTIC_PARTITION",
      "DETAIL_CONFORMANCE",
      "VISUAL_OWNER_REVIEW",
      "SLICER_REVIEW",
      "PHYSICAL_PROOF"
    ]
  });
}

export function buildParametricCharacterExecutionPlan(input) {
  const workflow = validateParametricCharacterWorkflow(input);
  return Object.freeze({
    schemaVersion: 1,
    domain: "3D_MODELING",
    workflowId: workflow.workflowId,
    assetId: workflow.assetId,
    constructionMode: workflow.constructionMode,
    steps: PARAMETRIC_MODELING_STEPS,
    executionBoundary: {
      delegatesToExistingSkillRouter: true,
      createsNewPlanner: false,
      createsNewScheduler: false,
      createsNewWorker: false,
      createsNewStateMachine: false
    },
    skillRequest: {
      skillType: "character_3d_parametric_build",
      operation: "BUILD_PARAMETRIC_PRINTABLE",
      assetId: workflow.assetId,
      specPath: "packages/3d-modeling-domain/examples/huihui-parametric-character.example.json",
      manifestPath: workflow.referenceManifest,
      outputRoot: workflow.outputRoot,
      targetHeightMm: workflow.targetHeightMm,
      masterMode: workflow.assembly.masterMode,
      manufacturingUnion: workflow.assembly.manufacturingUnion,
      forbidGlobalVoxelMaster: true,
      risk: workflow.riskLevel
    },
    providerRole: {
      meshy: "OPTIONAL_SHAPE_AND_DETAIL_REFERENCE",
      authoritativeMaster: false,
      semanticTopologyAuthority: "PARAMETRIC_PART_ASSEMBLY"
    },
    gates: [
      "REFERENCE_IDENTITY",
      "SEMANTIC_PARTITION",
      "PART_GEOMETRY",
      "JOINT_INTERFACE",
      "MULTIVIEW_SILHOUETTE",
      "HARD_FEATURE_RETENTION",
      "EXACT_MANUFACTURING_UNION",
      "SLICER_REVIEW",
      "PHYSICAL_PROOF"
    ]
  });
}

export function buildOrbitReferenceCalibrationPlan(input) {
  const workflow = validateOrbitReferenceCalibration(input);
  return Object.freeze({
    schemaVersion: 1,
    domain: "3D_MODELING",
    workflowId: workflow.workflowId,
    assetId: workflow.assetId,
    calibrationMode: workflow.calibrationMode,
    steps: ORBIT_CALIBRATION_STEPS,
    executionBoundary: {
      delegatesToExistingSkillRouter: true,
      createsNewPlanner: false,
      createsNewScheduler: false,
      createsNewWorker: false,
      createsNewRuntime: false,
      createsNewStateMachine: false
    },
    skillRequest: {
      skillType: "character_3d_parametric_build",
      operation: "CALIBRATE_FROM_AI_ORBIT",
      assetId: workflow.assetId,
      configPath:
        "packages/3d-modeling-domain/examples/huihui-ai-orbit-calibration.example.json",
      authoritativeFront: workflow.authoritativeFront,
      referenceManifest: workflow.referenceManifest,
      parametricSpec: workflow.parametricSpec,
      outputRoot: workflow.outputRoot,
      risk: workflow.riskLevel
    },
    observationAuthority: {
      authoritativeFront: "IDENTITY_AND_FRONTAL_PROPORTION_MASTER",
      generatedOrbitFrames: "NON_METRIC_CONFIDENCE_WEIGHTED_OBSERVATIONS",
      depthMaps: "OPTIONAL_PRIOR_ONLY",
      geometryMaster: workflow.fitting.geometryAuthority,
      automaticMasterOverwrite: false
    },
    gates: [
      "IDENTITY_LOCK",
      "PROVIDER_COST_APPROVAL",
      "FRAME_DRIFT_REJECTION",
      "ANGLE_COVERAGE",
      "LANDMARK_CONFIDENCE",
      "PARAMETER_PROPOSAL_REVIEW",
      "MULTIVIEW_REPROJECTION",
      "MATERIAL_REVIEW"
    ]
  });
}

export function buildInverseRenderFidelityPlan(input) {
  const workflow = validateInverseRenderFidelityWorkflow(input);
  return Object.freeze({
    schemaVersion: 1,
    domain: "3D_MODELING",
    workflowId: workflow.workflowId,
    assetId: workflow.assetId,
    evaluationMode: workflow.evaluationMode,
    baselineVersion: workflow.baselineVersion,
    steps: INVERSE_RENDER_FIDELITY_STEPS,
    executionBoundary: {
      delegatesToExistingSkillRouter: true,
      createsNewPlanner: false,
      createsNewScheduler: false,
      createsNewWorker: false,
      createsNewRuntime: false,
      createsNewStateMachine: false
    },
    skillRequest: {
      skillType: "character_3d_print_refinement",
      operation: "EVALUATE_INVERSE_RENDER_FIDELITY",
      assetId: workflow.assetId,
      configPath:
        "packages/3d-modeling-domain/examples/huihui-v15-inverse-render-fidelity.example.json",
      referenceManifest: workflow.referenceManifest,
      candidateRenderRoot: workflow.candidateRenderRoot,
      candidateSilhouetteRoot: workflow.candidateSilhouetteRoot,
      outputRoot: workflow.outputRoot,
      risk: workflow.riskLevel
    },
    authority: {
      geometryBaseline: workflow.baselineVersion,
      authoritativeFront: "METRIC_IDENTITY_AND_DETAIL_AUTHORITY",
      generatedViews: "NON_METRIC_DIAGNOSTIC_OBSERVATIONS",
      automaticMasterOverwrite: false
    },
    gates: [
      "MEAN_SILHOUETTE",
      "AUTHORITATIVE_FRONT_SILHOUETTE",
      "AUTHORITATIVE_FRONT_EDGES",
      "AUTHORITATIVE_FRONT_STRUCTURE",
      "AUTHORITATIVE_FRONT_MATERIALS",
      "SEMANTIC_REGION_MINIMUM",
      "NO_FRONT_REGRESSION",
      "VISUAL_OWNER_REVIEW"
    ]
  });
}

export function buildGaugeDrivenCalibrationPlan(input) {
  const workflow = validateGaugeDrivenCalibration(input);
  return Object.freeze({
    schemaVersion: 1,
    domain: "3D_MODELING",
    workflowId: workflow.workflowId,
    assetId: workflow.assetId,
    calibrationMode: workflow.calibrationMode,
    baselineVersion: workflow.baselineVersion,
    steps: GAUGE_CALIBRATION_STEPS,
    executionBoundary: {
      delegatesToExistingSkillRouter: true,
      createsNewPlanner: false,
      createsNewScheduler: false,
      createsNewWorker: false,
      createsNewRuntime: false,
      createsNewStateMachine: false
    },
    skillRequest: {
      skillType: "character_3d_parametric_build",
      operation: "CALIBRATE_WITH_MULTIVIEW_GAUGES",
      assetId: workflow.assetId,
      configPath:
        "packages/3d-modeling-domain/examples/huihui-v15-gauge-calibration.example.json",
      baselineMesh: workflow.baselineMesh,
      referenceManifest: workflow.referenceManifest,
      observationReport: workflow.observationReport,
      parametricSpec: workflow.parametricSpec,
      outputRoot: workflow.outputRoot,
      risk: workflow.riskLevel
    },
    authority: {
      authoritativeFront: workflow.viewAuthority.authoritativeFront,
      generatedViews: "NON_METRIC_DEPTH_AND_OCCLUSION_PRIORS",
      geometryMaster: workflow.fitting.geometryAuthority,
      globalVoxelMasterAllowed: false,
      automaticMasterOverwrite: false
    },
    patchPolicy: {
      scope: "SEMANTIC_PART_LOCAL_PATCHES",
      primitiveAndCurveFit: true,
      preservePartBoundaries: true,
      manufacturingUnion: "DEFERRED"
    },
    gates: [
      "REFERENCE_SCALE",
      "VIEW_REGISTRATION",
      "DATUM_LOCK",
      "SEMANTIC_PROBE_COVERAGE",
      "DEPTH_AUTHORITY",
      "INTERFACE_TOLERANCE",
      "LOCAL_PATCH_OWNER_REVIEW",
      "MULTIVIEW_REPROJECTION",
      "NO_BASELINE_OVERWRITE"
    ]
  });
}

export function evaluateModelingEvidence(input, evidence = {}) {
  const workflow = validateModelingWorkflow(input);
  const findings = [];
  if (evidence.geometry !== "PASS") findings.push("GEOMETRY_GATE_NOT_PASS");
  if (evidence.silhouette === "FAIL" || !evidence.silhouette) findings.push("SILHOUETTE_GATE_NOT_PASS");
  if (evidence.surfaceQuality !== "PASS") findings.push("SURFACE_QUALITY_GATE_NOT_PASS");
  if (evidence.semanticPartition !== "PASS") findings.push("SEMANTIC_PARTITION_NOT_PROVEN");
  if (evidence.detailConformance !== "PASS") findings.push("DETAIL_CONFORMANCE_NOT_PROVEN");
  if (evidence.visualReview !== "PASS") findings.push("VISUAL_REVIEW_REQUIRED");
  if (evidence.slicerReview !== "PASS") findings.push("SLICER_REVIEW_REQUIRED");
  if (evidence.physicalProof !== "PASS") findings.push("PHYSICAL_PROOF_REQUIRED");
  return {
    schemaVersion: 1,
    workflowId: workflow.workflowId,
    status: findings.length === 0 ? "PASS" : "HOLD",
    findings
  };
}
