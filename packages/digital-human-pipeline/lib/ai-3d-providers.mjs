import { existsSync } from "node:fs";
import { totalmem } from "node:os";
import { basename, dirname, resolve } from "node:path";

const gib = 1024 ** 3;

export const ai3dProviders = {
  "visual-hull-local": {
    providerId: "visual-hull-local",
    displayName: "Local Visual Hull",
    executionMode: "local_process",
    fidelity: "scaffold_only",
    maximumViews: 8,
    credentialReferenceRequired: false,
    costApprovalRequired: false,
    officialDocs: null
  },
  "meshy-multi-image": {
    providerId: "meshy-multi-image",
    displayName: "Meshy Multi-Image to 3D",
    executionMode: "external_provider",
    fidelity: "high_fidelity_candidate",
    maximumViews: 4,
    credentialReferenceRequired: true,
    costApprovalRequired: true,
    officialDocs: "https://docs.meshy.ai/en/api/multi-image-to-3d"
  },
  "stable-fast-3d-local": {
    providerId: "stable-fast-3d-local",
    displayName: "Stable Fast 3D Local",
    executionMode: "local_process",
    fidelity: "single_view_candidate",
    maximumViews: 1,
    credentialReferenceRequired: true,
    costApprovalRequired: false,
    officialDocs: "https://github.com/Stability-AI/stable-fast-3d"
  },
  "hunyuan3d-2mv-worker": {
    providerId: "hunyuan3d-2mv-worker",
    displayName: "Hunyuan3D 2 Multi-View Worker",
    executionMode: "remote_worker",
    fidelity: "high_fidelity_candidate",
    maximumViews: 4,
    credentialReferenceRequired: false,
    costApprovalRequired: false,
    officialDocs: "https://github.com/Tencent-Hunyuan/Hunyuan3D-2"
  }
};

function getManifestViews(manifest) {
  if (!Array.isArray(manifest?.views) || manifest.views.length < 4) {
    const error = new Error("AI_3D_MULTIVIEW_MANIFEST_INCOMPLETE");
    error.code = "AI_3D_MULTIVIEW_MANIFEST_INCOMPLETE";
    error.details = { availableViews: manifest?.views?.length ?? 0 };
    throw error;
  }
  return manifest.views;
}

function findAngle(views, angle) {
  const view = views.find(item => Number(item.angle) === angle);
  if (!view?.normalizedPath || !view?.maskPath) {
    const error = new Error("AI_3D_CARDINAL_VIEW_MISSING");
    error.code = "AI_3D_CARDINAL_VIEW_MISSING";
    error.details = { angle };
    throw error;
  }
  return view;
}

export function selectProviderViews(manifest, providerId) {
  const provider = ai3dProviders[providerId];
  if (!provider) {
    const error = new Error("AI_3D_PROVIDER_UNKNOWN");
    error.code = "AI_3D_PROVIDER_UNKNOWN";
    error.details = { providerId };
    throw error;
  }
  const views = getManifestViews(manifest);
  if (provider.maximumViews === 1) return [findAngle(views, 0)];
  if (provider.maximumViews === 4) return [0, 90, 180, 270].map(angle => findAngle(views, angle));
  return views.slice(0, provider.maximumViews);
}

export function getAi3dProviderHealth(options = {}) {
  const memoryGb = Math.round((options.totalMemoryBytes ?? totalmem()) / gib);
  const workspaceRoot = options.workspaceRoot ? resolve(options.workspaceRoot) : null;
  const visualHullAvailable = workspaceRoot
    ? existsSync(resolve(workspaceRoot, "../../artifacts/media/huihui-printable-v3/visual-hull-r192-v7/huihui-v3-visual-hull.glb"))
    : true;
  const stableFastModelAvailable = Boolean(options.stableFastModelAvailable);
  const huggingFaceAuthorized = Boolean(options.huggingFaceAuthorized);
  const gpuWorkerAvailable = Boolean(options.gpuWorkerAvailable);
  const meshyCredentialAvailable = Boolean(options.meshyCredentialAvailable);

  return [
    {
      ...ai3dProviders["visual-hull-local"],
      status: visualHullAvailable ? "AVAILABLE" : "BLOCKED",
      blockers: visualHullAvailable ? [] : ["VISUAL_HULL_ARTIFACT_MISSING"],
      recommendation: "Use only for silhouette, scale, watertightness and reprojection QA."
    },
    {
      ...ai3dProviders["meshy-multi-image"],
      status: meshyCredentialAvailable ? "AVAILABLE_WITH_APPROVAL" : "BLOCKED",
      blockers: meshyCredentialAvailable ? ["COST_APPROVAL_REQUIRED"] : ["MESHY_CREDENTIAL_REFERENCE_REQUIRED"],
      recommendation: "Preferred executable high-fidelity path on this 16GB Mac."
    },
    {
      ...ai3dProviders["stable-fast-3d-local"],
      status: stableFastModelAvailable && huggingFaceAuthorized && memoryGb >= 32 ? "AVAILABLE" : "BLOCKED",
      blockers: [
        ...(huggingFaceAuthorized ? [] : ["HUGGING_FACE_MODEL_ACCESS_REQUIRED"]),
        ...(stableFastModelAvailable ? [] : ["STABLE_FAST_3D_MODEL_NOT_INSTALLED"]),
        ...(memoryGb >= 32 ? [] : ["UNIFIED_MEMORY_BELOW_32_GB_RECOMMENDATION"])
      ],
      recommendation: "Do not download on the current machine until disk and model access are available.",
      detectedMemoryGb: memoryGb
    },
    {
      ...ai3dProviders["hunyuan3d-2mv-worker"],
      status: gpuWorkerAvailable ? "AVAILABLE" : "BLOCKED",
      blockers: gpuWorkerAvailable ? [] : ["NVIDIA_GPU_WORKER_REQUIRED"],
      recommendation: "Use a governed GPU Worker for local/private high-fidelity reconstruction."
    }
  ];
}

export function buildAi3dReconstructionPlan({
  providerId,
  manifest,
  manifestPath,
  depthManifestPath,
  outputRoot,
  credentialAvailable = false
}) {
  const provider = ai3dProviders[providerId];
  if (!provider) {
    const error = new Error("AI_3D_PROVIDER_UNKNOWN");
    error.code = "AI_3D_PROVIDER_UNKNOWN";
    error.details = { providerId };
    throw error;
  }
  const selectedViews = selectProviderViews(manifest, providerId);
  const external = provider.executionMode === "external_provider";
  const status = external
    ? credentialAvailable
      ? "AWAITING_COST_APPROVAL"
      : "AWAITING_APPROVAL_AND_CREDENTIAL_REFERENCE"
    : providerId === "visual-hull-local"
      ? "SCAFFOLD_READY"
      : "BLOCKED_RUNTIME_REQUIREMENTS";
  return {
    schemaVersion: 1,
    jobId: `${manifest.assetId}-${providerId}-reconstruction-v1`,
    assetId: manifest.assetId,
    status,
    provider: {
      providerId,
      displayName: provider.displayName,
      executionMode: provider.executionMode,
      fidelity: provider.fidelity,
      officialDocs: provider.officialDocs
    },
    credentialReference: provider.credentialReferenceRequired
      ? {
          type: "env_ref",
          reference: providerId === "meshy-multi-image" ? "meshy-api-key-ref" : "hugging-face-token-ref",
          environmentVariable: providerId === "meshy-multi-image" ? "MESHY_API_KEY" : "HF_TOKEN",
          valueRead: false,
          status: credentialAvailable ? "REFERENCE_PRESENT" : "REFERENCE_REQUIRED"
        }
      : null,
    input: {
      manifestPath: resolve(manifestPath),
      depthManifestPath: depthManifestPath ? resolve(depthManifestPath) : null,
      authoritativeViewAngle: Number(manifest.authoritativeView ?? 0),
      generatedViewsAreMetric: Boolean(manifest.generatedViewsAreMetric),
      views: selectedViews.map(view => ({
        angle: Number(view.angle),
        view: view.view,
        imagePath: resolve(view.normalizedPath),
        maskPath: resolve(view.maskPath),
        source: basename(view.normalizedPath),
        authority: view.authority
      })),
      identityConstraints: [
        "Preserve the approved squat, extra-wide body-to-limb ratio.",
        "Preserve short articulated arms and legs with oversized boots.",
        "Preserve the rounded rectangular black face screen and warm white facial marks.",
        "Preserve compact construction hardhat proportions and the 水泥二厂 branding.",
        "Do not replace the character with a generic humanoid robot."
      ],
      printTarget: {
        heightMm: 180,
        watertightRequired: true,
        manifoldRequired: true,
        minimumWallMm: 1.6,
        minimumFeatureMm: 0.8
      }
    },
    providerRequestMapping: providerId === "meshy-multi-image"
      ? {
          endpoint: "POST https://api.meshy.ai/openapi/v1/multi-image-to-3d",
          imageUrls: "$base64DataUrisAtExecutionBoundary(input.views[*].imagePath)",
          aiModel: "meshy-6",
          shouldTexture: false,
          enablePbr: false,
          shouldRemesh: false,
          imageEnhancement: false,
          targetFormats: ["glb", "obj", "stl"]
        }
      : null,
    qualityGate: {
      requiredBeforeApproval: true,
      projectionAngles: [0, 45, 90, 135, 180, 225, 270, 315],
      silhouetteIou: {
        authoritativeFront: 0.96,
        cardinalMinimum: 0.94,
        diagonalMinimum: 0.90
      },
      keypointErrorMaximumFrameRatio: 0.02,
      depthConsistencyRequired: true,
      materialReviewRequired: true,
      printableMeshReviewRequired: true,
      currentScaffoldMayNotPassAsFinal: true
    },
    governance: {
      risk: external ? "MEDIUM" : "LOW",
      externalModelCall: external,
      requiresCostApproval: provider.costApprovalRequired,
      requiresCredentialReference: provider.credentialReferenceRequired,
      automaticSubmissionAllowed: false,
      secretPersistence: "forbidden"
    },
    output: {
      artifactRoot: resolve(outputRoot),
      expectedModel: "provider-candidate.glb",
      auditRecord: "provider-submission-audit.json",
      validationReport: "candidate-quality-gate.json"
    },
    notes: [
      "The visual hull is a geometric scaffold and must not be presented as the final character asset.",
      "AI-derived hidden views are constraints, not metric scans.",
      "Provider output is only a candidate until eight-view reprojection, depth, topology and printability gates pass.",
      `The manifest root is ${dirname(resolve(manifestPath))}.`
    ]
  };
}
