export type ModelingRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ModelingWorkflowContract {
  readonly schemaVersion: 1;
  readonly domain: "3D_MODELING";
  readonly workflowId: string;
  readonly assetId: string;
  readonly sourceMesh: string;
  readonly referenceManifest: string;
  readonly outputRoot: string;
  readonly targetHeightMm: number;
  readonly surfaceSubdivisionLevel: 0 | 1 | 2;
  readonly surfaceMethod: "voxel" | "catmull-clark" | "relax-only";
  readonly surfaceProfile: "uniform" | "feature-preserving";
  readonly featureAngleDegrees: number;
  readonly featureProtectionRings: number;
  readonly semanticRegions: readonly {
    readonly id: string;
    readonly semanticClass:
      | "ORGANIC_SHELL"
      | "HARD_SURFACE"
      | "JOINT_INTERFACE"
      | "RELIEF"
      | "MATERIAL_BOUNDARY";
    readonly treatment: "FAIR" | "PRESERVE" | "REBUILD" | "SEPARATE";
    readonly ownerReviewRequired: boolean;
  }[];
  readonly riskLevel: ModelingRisk;
  readonly constraints: readonly string[];
  readonly acceptanceCriteria: readonly string[];
}

export type ParametricShapeFamily =
  | "ELLIPSOID"
  | "ROUNDED_PRISM"
  | "DOME"
  | "CYLINDER"
  | "CAPSULE"
  | "CURVE_TUBE"
  | "RELIEF"
  | "COMPOSITE";

export interface ParametricCharacterWorkflowContract {
  readonly schemaVersion: 1;
  readonly domain: "3D_MODELING";
  readonly workflowId: string;
  readonly assetId: string;
  readonly constructionMode: "GEOMETRY_FIRST";
  readonly referenceManifest: string;
  readonly outputRoot: string;
  readonly targetHeightMm: number;
  readonly geometrySpec: Readonly<Record<string, unknown>>;
  readonly parts: readonly {
    readonly id: string;
    readonly semanticRole:
      | "BODY"
      | "FACE"
      | "HELMET"
      | "EAR"
      | "ARM"
      | "HAND"
      | "LEG"
      | "BOOT"
      | "BRANDING"
      | "BASE";
    readonly shapeFamily: ParametricShapeFamily;
    readonly materialClass: string;
    readonly parent: string | null;
    readonly joinPolicy:
      | "KEEP_SEPARATE"
      | "CONTROLLED_OVERLAP"
      | "EXACT_BOOLEAN_UNION"
      | "RELIEF_ATTACH";
    readonly hardEdgePolicy: "PRESERVE" | "CONTROLLED_FILLET" | "SMOOTH_ORGANIC";
  }[];
  readonly assembly: {
    readonly masterMode: "SEMANTIC_PART_ASSEMBLY";
    readonly manufacturingUnion: "DEFERRED" | "EXACT_BOOLEAN" | "CONTROLLED_HYBRID";
    readonly forbidGlobalVoxelMaster: true;
    readonly minimumJointOverlapMm: number;
    readonly booleanToleranceMm: number;
  };
  readonly riskLevel: ModelingRisk;
  readonly constraints: readonly string[];
  readonly acceptanceCriteria: readonly string[];
}

export interface OrbitReferenceCalibrationContract {
  readonly schemaVersion: 1;
  readonly domain: "3D_MODELING";
  readonly workflowId: string;
  readonly assetId: string;
  readonly calibrationMode: "AI_ORBIT_REFERENCE_CALIBRATION";
  readonly authoritativeFront: string;
  readonly referenceManifest: string;
  readonly parametricSpec: string;
  readonly outputRoot: string;
  readonly provider: "kling-ai";
  readonly orbit: {
    readonly durationSeconds: 5 | 10;
    readonly expectedDegrees: 360;
    readonly sampleAngles: readonly number[];
    readonly fixedCamera: true;
    readonly neutralPose: true;
    readonly orthographicPreferred: true;
  };
  readonly frameAcceptance: {
    readonly minimumForegroundRatio: number;
    readonly maximumForegroundRatio: number;
    readonly maximumHeightDriftRatio: number;
    readonly rejectIdentityDrift: true;
    readonly rejectBrandingMutation: true;
    readonly rejectAnatomyMutation: true;
  };
  readonly fitting: {
    readonly geometryAuthority: "PARAMETRIC_SEMANTIC_ASSEMBLY";
    readonly authoritativeFrontWeight: number;
    readonly generatedFrameWeight: number;
    readonly objective: "CONFIDENCE_WEIGHTED_MULTI_VIEW_REPROJECTION";
    readonly materialTrackingAfterGeometryLock: true;
    readonly automaticMasterOverwrite: false;
  };
  readonly riskLevel: ModelingRisk;
  readonly constraints: readonly string[];
  readonly acceptanceCriteria: readonly string[];
}

export interface InverseRenderFidelityContract {
  readonly schemaVersion: 1;
  readonly domain: "3D_MODELING";
  readonly workflowId: string;
  readonly assetId: string;
  readonly evaluationMode: "HIGH_RESOLUTION_INVERSE_RENDER_ALIGNMENT";
  readonly baselineVersion: string;
  readonly referenceManifest: string;
  readonly candidateRenderRoot: string;
  readonly candidateSilhouetteRoot: string;
  readonly outputRoot: string;
  readonly viewAuthority: {
    readonly authoritativeFrontWeight: number;
    readonly generatedViewWeight: number;
    readonly generatedViewsAreMetric: false;
  };
  readonly metrics: {
    readonly silhouetteIou: true;
    readonly edgeChamferSimilarity: true;
    readonly multiscaleStructuralSimilarity: true;
    readonly colorMaterialSimilarity: true;
  };
  readonly semanticRegions: readonly {
    readonly id: string;
    readonly box: readonly [number, number, number, number];
    readonly weight: number;
  }[];
  readonly promotion: {
    readonly automaticMasterOverwrite: false;
    readonly requireNoAuthoritativeFrontRegression: true;
    readonly requireAllSemanticRegions: true;
    readonly targets: Readonly<Record<string, number>>;
  };
  readonly riskLevel: ModelingRisk;
  readonly constraints: readonly string[];
  readonly acceptanceCriteria: readonly string[];
}

export interface ModelingExecutionPlan {
  readonly schemaVersion: 1;
  readonly domain: "3D_MODELING";
  readonly workflowId: string;
  readonly steps: readonly string[];
  readonly skillRequest: Readonly<Record<string, unknown>>;
}

export type SurfaceQualityGrade =
  | "REWORK_REQUIRED"
  | "REFINED_PROTOTYPE"
  | "FINE_ASSET";

export interface ModelingSurfaceQualityReport {
  readonly schemaVersion: 1;
  readonly domain: "3D_MODELING";
  readonly check: "SURFACE_QUALITY";
  readonly status: "PASS" | "PASS_WITH_CONDITIONS" | "FAIL";
  readonly grade: SurfaceQualityGrade;
  readonly metrics: Readonly<Record<string, unknown>>;
  readonly gates: {
    readonly prototypeSurfaceContinuity: "PASS" | "FAIL";
    readonly fineAssetCurvature: "PASS" | "HOLD";
  };
  readonly findings: readonly string[];
}
