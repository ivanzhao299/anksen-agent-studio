import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildAi3dReconstructionPlan,
  getAi3dProviderHealth,
  selectProviderViews
} from "../lib/ai-3d-providers.mjs";
import {
  buildKlingSubmissionPreview,
  createKlingSubmissionAudit,
  getKlingCredentialAvailability,
  getKlingTask,
  resolveKlingApiKey,
  submitKlingImageToVideo,
  updateKlingTaskAudit
} from "../lib/kling-api-client.mjs";
import { buildOrbitReferenceDispatchPlan } from "../lib/ai-video-providers.mjs";
import { evaluateOrbitCalibrationCandidate } from "../lib/orbit-calibration-gate.mjs";
import { evaluateInverseRenderCandidate } from "../lib/inverse-render-fidelity-gate.mjs";
import {
  buildMeshySubmissionPreview,
  buildMeshyTextSubmissionPreview,
  createMeshyTextSubmissionAudit,
  getMeshyTextTask,
  getMeshyCredentialAvailability,
  submitMeshyMultiImage,
  submitMeshyTextPreview
} from "../lib/meshy-3d-client.mjs";

const packageRoot = resolve(import.meta.dirname, "..");
const workspace = resolve(packageRoot, "../../runtime/workspaces/media/cement-factory-digital-human-v7");
const fidelityWorkspace = resolve(packageRoot, "../../runtime/workspaces/media/cement-factory-digital-human-v8");
const runInWorkspace = resolve(packageRoot, "../../runtime/workspaces/media/cement-factory-digital-human-v10-iphone-run-in");
const dynamicSceneWorkspace = resolve(packageRoot, "../../runtime/workspaces/media/cement-factory-digital-human-v11-iphone-dynamic-scene");
const huihuiMultiviewManifest = resolve(packageRoot, "../../runtime/workspaces/media/huihui-printable-v3/multiview-manifest.json");
const orbitConfig = resolve(
  packageRoot,
  "../3d-modeling-domain/examples/huihui-ai-orbit-calibration.example.json"
);
const parametricSpec = resolve(
  packageRoot,
  "../3d-modeling-domain/examples/huihui-parametric-character.example.json"
);
const inverseRenderConfig = resolve(
  packageRoot,
  "../3d-modeling-domain/examples/huihui-v15-inverse-render-fidelity.example.json"
);
const meshyTextPlan = resolve(
  packageRoot,
  "../3d-modeling-domain/examples/huihui-meshy6-assembly-prompt.example.json"
);
const gaugeCalibrationConfig = resolve(
  packageRoot,
  "../3d-modeling-domain/examples/huihui-v15-gauge-calibration.example.json"
);
const gaugeObservations = resolve(
  packageRoot,
  "../../runtime/artifacts/media/huihui-printable-v3/orbit-calibration-v1/orbit-frame-observations.json"
);

test("validates the reusable digital human project", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(packageRoot, "bin/digital-human-pipeline.mjs"), "validate", "--project", workspace],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "PASS");
  assert.equal(report.characters, 4);
  assert.equal(report.dialogue, 4);
});

test("mesh assembly inspection requires explicit mesh and output paths", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(packageRoot, "bin/digital-human-pipeline.mjs"), "inspect-mesh-assembly"],
    { encoding: "utf8" }
  );
  assert.notEqual(result.status, 0);
  const report = JSON.parse(result.stderr);
  assert.equal(report.code, "MESH_ASSEMBLY_MESH_REQUIRED");
});

test("builds a fail-closed multiview gauge work order without mutating v15", () => {
  const output = mkdtempSync(resolve(tmpdir(), "huihui-gauge-calibration-"));
  const result = spawnSync(
    process.execPath,
    [
      resolve(packageRoot, "bin/digital-human-pipeline.mjs"),
      "build-gauge-calibration",
      "--config",
      gaugeCalibrationConfig,
      "--observations",
      gaugeObservations,
      "--output",
      output
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "HOLD_OWNER_REVIEW");
  assert.equal(report.baselinePreserved, true);
  assert.equal(report.externalModelCalled, false);
  const workOrder = JSON.parse(
    readFileSync(resolve(output, "local-patch-work-order.json"), "utf8")
  );
  assert.equal(workOrder.masterMeshMutationAllowed, false);
  assert.equal(workOrder.globalSmoothingAllowed, false);
  assert.equal(workOrder.globalVoxelRemeshAllowed, false);
  assert.ok(workOrder.operations.some(item => item.partId === "body-shell"));
  assert.ok(workOrder.operations.some(item => item.partId === "hand-rig"));
});

test("requires an explicit gauge config before transferring v15 depth", () => {
  const result = spawnSync(
    process.execPath,
    [
      resolve(packageRoot, "bin/digital-human-pipeline.mjs"),
      "build-gauge-depth-transfer"
    ],
    { encoding: "utf8" }
  );
  assert.notEqual(result.status, 0);
  const report = JSON.parse(result.stderr);
  assert.equal(report.code, "GAUGE_CALIBRATION_CONFIG_REQUIRED");
});

test("requires an explicit semantic part before building a candidate", () => {
  const result = spawnSync(
    process.execPath,
    [
      resolve(packageRoot, "bin/digital-human-pipeline.mjs"),
      "build-semantic-part-candidate",
      "--config",
      gaugeCalibrationConfig
    ],
    { encoding: "utf8" }
  );
  assert.notEqual(result.status, 0);
  const report = JSON.parse(result.stderr);
  assert.equal(report.code, "SEMANTIC_PART_REQUIRED");
});

test("rejects unsupported semantic parts before opening Blender", () => {
  const result = spawnSync(
    process.execPath,
    [
      resolve(packageRoot, "bin/digital-human-pipeline.mjs"),
      "build-semantic-part-candidate",
      "--config",
      gaugeCalibrationConfig,
      "--part",
      "unknown-part"
    ],
    { encoding: "utf8" }
  );
  assert.notEqual(result.status, 0);
  const report = JSON.parse(result.stderr);
  assert.equal(report.code, "SEMANTIC_PART_NOT_SUPPORTED");
});

test("generates pinyin-driven viseme tracks", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(packageRoot, "bin/digital-human-pipeline.mjs"), "prepare", "--project", workspace],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  const track = JSON.parse(readFileSync(report.visemeTracks[0].output, "utf8"));
  assert.equal(track.alignment, "script-driven-pinyin");
  assert.ok(track.visemes.some(item => item.viseme !== "REST"));
});

test("validates the high-fidelity reference-locked project", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(packageRoot, "bin/digital-human-pipeline.mjs"), "validate", "--project", fidelityWorkspace],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "PASS");
  assert.equal(report.fidelity, "high");
  assert.equal(report.reconstructionMode, "depth-plate");
  assert.equal(report.duration, 6);
});

test("prepares an extended portrait run-in with independent locked frames", () => {
  const output = mkdtempSync(resolve(tmpdir(), "digital-human-run-in-plan-"));
  const result = spawnSync(
    process.execPath,
    [
      resolve(packageRoot, "bin/digital-human-pipeline.mjs"),
      "prepare-ai-video",
      "--project",
      runInWorkspace,
      "--provider",
      "kling-ai",
      "--output",
      output
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  const dispatch = JSON.parse(readFileSync(resolve(output, "ai-video-dispatch-plan.json"), "utf8"));
  const framePreparation = JSON.parse(readFileSync(resolve(output, "frame-preparation-report.json"), "utf8"));
  assert.equal(dispatch.input.durationSeconds, 10);
  assert.deepEqual(dispatch.input.resolution, { width: 720, height: 1280 });
  assert.equal(dispatch.input.nativeAudio, true);
  assert.equal(dispatch.input.motionTimeline.length, 5);
  assert.match(dispatch.input.prompt, /14至16岁青少年男性声线/);
  assert.match(dispatch.input.negativePrompt, /成年男性低沉嗓音/);
  assert.notEqual(framePreparation.sourceVideo, framePreparation.sourceEndFrame);
  assert.equal(framePreparation.grounding.precomposedCharacter, true);
  assert.equal(framePreparation.grounding.backgroundLock, true);
});

test("allows controlled scene motion while rejecting unstable camera behavior", () => {
  const output = mkdtempSync(resolve(tmpdir(), "digital-human-dynamic-scene-plan-"));
  const result = spawnSync(
    process.execPath,
    [
      resolve(packageRoot, "bin/digital-human-pipeline.mjs"),
      "prepare-ai-video",
      "--project",
      dynamicSceneWorkspace,
      "--provider",
      "kling-ai",
      "--output",
      output
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  const dispatch = JSON.parse(readFileSync(resolve(output, "ai-video-dispatch-plan.json"), "utf8"));
  assert.equal(dispatch.input.durationSeconds, 12);
  assert.equal(dispatch.input.backgroundLocked, false);
  assert.match(dispatch.input.prompt, /柳叶沙沙声/);
  assert.match(dispatch.input.prompt, /右向弧线移动/);
  assert.doesNotMatch(dispatch.input.negativePrompt, /背景移动/);
  assert.match(dispatch.input.negativePrompt, /剧烈摇镜/);
});

test("reference-lock renderer rejects a project without its locked asset", () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "digital-human-reference-lock-"));
  for (const file of ["characters.json", "scene.json", "story.json"]) {
    writeFileSync(resolve(temporaryRoot, file), readFileSync(resolve(fidelityWorkspace, file)));
  }
  const characters = JSON.parse(readFileSync(resolve(temporaryRoot, "characters.json"), "utf8"));
  characters[0].referenceAssets.referenceLockedCutout = "references/not-present.png";
  writeFileSync(resolve(temporaryRoot, "characters.json"), JSON.stringify(characters));
  const result = spawnSync(
    process.execPath,
    [
      resolve(packageRoot, "bin/digital-human-pipeline.mjs"),
      "render-reference-lock",
      "--project",
      temporaryRoot,
      "--output",
      resolve(temporaryRoot, "output")
    ],
    { encoding: "utf8" }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DIGITAL_HUMAN_PROJECT_INVALID|DIGITAL_HUMAN_REFERENCE_LOCK_ASSET_MISSING/);
});

test("extracts four character reference bundles with tri-view assets", () => {
  const source = "/Users/mac/Downloads/04FB03AF-169F-4050-B084-A8FB0A654F2B 2.PNG";
  if (!existsSync(source)) return;
  const output = mkdtempSync(resolve(tmpdir(), "digital-human-character-assets-"));
  const result = spawnSync(
    process.execPath,
    [
      resolve(packageRoot, "bin/digital-human-pipeline.mjs"),
      "extract-reference-assets",
      "--project",
      fidelityWorkspace,
      "--source",
      source,
      "--output",
      output
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "PASS");
  assert.equal(report.characters.length, 4);
  for (const character of report.characters) {
    assert.ok(character.views.includes("front"));
    assert.ok(character.views.includes("side"));
    assert.ok(character.views.includes("back"));
  }
  assert.ok(existsSync(report.contactSheet));
});

test("prepares a gated start-end-frame provider plan without reading credentials", () => {
  const output = mkdtempSync(resolve(tmpdir(), "digital-human-ai-video-plan-"));
  const result = spawnSync(
    process.execPath,
    [
      resolve(packageRoot, "bin/digital-human-pipeline.mjs"),
      "prepare-ai-video",
      "--project",
      fidelityWorkspace,
      "--provider",
      "kling-ai",
      "--output",
      output
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  const dispatch = JSON.parse(readFileSync(resolve(output, "ai-video-dispatch-plan.json"), "utf8"));
  const framePreparation = JSON.parse(readFileSync(resolve(output, "frame-preparation-report.json"), "utf8"));
  assert.equal(report.status, "AWAITING_APPROVAL_AND_CREDENTIAL_REFERENCE");
  assert.equal(report.externalModelCalled, false);
  assert.equal(report.credentialValueRead, false);
  assert.equal(dispatch.credentialReference.valueRead, false);
  assert.equal(dispatch.input.motionTimeline.length, 3);
  assert.equal(dispatch.providerRequestMapping.contents[2].type, "last_frame");
  assert.equal(dispatch.providerRequestMapping.settings.duration, "$input.durationSeconds");
  assert.ok(Array.isArray(dispatch.input.identityLock.invariants));
  assert.ok(Array.isArray(dispatch.input.identityLock.prohibited));
  assert.equal(framePreparation.grounding.environmentColorMatch, true);
  assert.equal(framePreparation.grounding.groundOcclusion, true);
  assert.equal(framePreparation.grounding.contactShadow, "dual-local-mask");
  assert.ok(existsSync(dispatch.input.startFrame));
  assert.ok(existsSync(dispatch.input.endFrame));
});

test("builds a governed identity-locked orbit plan without treating frames as metric", () => {
  const workflow = JSON.parse(readFileSync(orbitConfig, "utf8"));
  const plan = buildOrbitReferenceDispatchPlan({
    workflow,
    authoritativeFront: resolve(
      packageRoot,
      "../../runtime/workspaces/media/huihui-printable-v3/references/source/huihui-brand-front-master.png"
    ),
    outputRoot: resolve(tmpdir(), "orbit-plan")
  });
  assert.equal(plan.provider.capability, "identity-locked-orbit-reference");
  assert.equal(plan.input.orbitCalibration.generatedFramesAreMetric, false);
  assert.equal(plan.input.endFrame, plan.input.startFrame);
  assert.equal(plan.governance.requiresCostApproval, true);
  assert.equal(plan.credentialReference.valueRead, false);
});

test("prepares an orbit provider plan without making an external call", () => {
  const output = mkdtempSync(resolve(tmpdir(), "digital-human-orbit-plan-"));
  const result = spawnSync(
    process.execPath,
    [
      resolve(packageRoot, "bin/digital-human-pipeline.mjs"),
      "prepare-orbit-reference",
      "--config",
      orbitConfig,
      "--output",
      output
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  const plan = JSON.parse(readFileSync(report.planPath, "utf8"));
  assert.equal(report.externalModelCalled, false);
  assert.equal(report.credentialValueRead, false);
  assert.equal(plan.input.orbitCalibration.expectedDegrees, 360);
});

test("captures a v15 high-resolution inverse-render baseline without external calls", () => {
  const output = mkdtempSync(resolve(tmpdir(), "digital-human-inverse-render-"));
  const result = spawnSync(
    process.execPath,
    [
      resolve(packageRoot, "bin/digital-human-pipeline.mjs"),
      "evaluate-render-fidelity",
      "--config",
      inverseRenderConfig,
      "--output",
      output,
      "--size",
      "256"
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.baselineVersion, "refined-v15-modeling-domain");
  assert.equal(report.externalModelCalled, false);
  assert.equal(report.credentialValueRead, false);
  assert.ok(report.summary.frontSilhouetteIou > 0.8);
  assert.ok(existsSync(report.reportPath));
  assert.ok(existsSync(report.contactSheetPath));
});

test("inverse-render promotion rejects front or semantic regressions", () => {
  const baseline = {
    summary: {
      meanSilhouetteIou: 0.82,
      frontSilhouetteIou: 0.9,
      frontEdgeChamferSimilarity: 0.72,
      frontStructuralSimilarity: 0.72,
      frontColorMaterialSimilarity: 0.8,
      frontComposite: 0.78,
      minimumSemanticComposite: 0.65
    },
    authoritativeFrontSemanticRegions: [
      { id: "face-screen", composite: 0.7 }
    ]
  };
  const candidate = {
    summary: {
      ...baseline.summary,
      frontComposite: 0.79,
      frontEdgeChamferSimilarity: 0.73,
      minimumSemanticComposite: 0.66
    },
    gates: { frontComposite: "PASS" },
    authoritativeFrontSemanticRegions: [
      { id: "face-screen", composite: 0.69 }
    ]
  };
  const report = evaluateInverseRenderCandidate({ baseline, candidate });
  assert.equal(report.status, "REJECTED_KEEP_BASELINE");
  assert.deepEqual(report.semanticRegressions, ["face-screen"]);
  assert.equal(report.automaticMasterOverwrite, false);
});

test("observes the existing sparse multiview fixture and writes a review-only fit proposal", () => {
  const output = mkdtempSync(resolve(tmpdir(), "digital-human-orbit-observation-"));
  const observations = resolve(output, "orbit-frame-observations.json");
  const observe = spawnSync(
    process.execPath,
    [
      resolve(packageRoot, "bin/digital-human-pipeline.mjs"),
      "observe-orbit-reference",
      "--config",
      orbitConfig,
      "--manifest",
      huihuiMultiviewManifest,
      "--output",
      observations
    ],
    { encoding: "utf8" }
  );
  assert.equal(observe.status, 0, observe.stderr);
  const observationReport = JSON.parse(readFileSync(observations, "utf8"));
  assert.equal(observationReport.generatedViewsAreMetric, false);
  assert.equal(observationReport.sourceMode, "SPARSE_MULTIVIEW_FIXTURE");
  assert.equal(observationReport.frames.length, 8);

  const proposal = resolve(output, "geometry-parameter-proposal.json");
  const fit = spawnSync(
    process.execPath,
    [
      resolve(packageRoot, "bin/digital-human-pipeline.mjs"),
      "fit-orbit-parameters",
      "--observations",
      observations,
      "--spec",
      parametricSpec,
      "--output",
      proposal
    ],
    { encoding: "utf8" }
  );
  assert.equal(fit.status, 0, fit.stderr);
  const fitReport = JSON.parse(readFileSync(proposal, "utf8"));
  assert.ok(["HOLD", "REVIEW_REQUIRED"].includes(fitReport.status));
  assert.equal(fitReport.automaticMasterOverwrite, false);
});

test("rejects an orbit calibration candidate that regresses the baseline", () => {
  const report = evaluateOrbitCalibrationCandidate({
    baseline: {
      status: "PASS_WITH_CONDITIONS",
      summary: { meanIou: 0.752, frontIou: 0.744 },
      views: [
        { angle: 0, iou: 0.744 },
        { angle: 90, iou: 0.785 }
      ]
    },
    candidate: {
      status: "PASS_WITH_CONDITIONS",
      summary: { meanIou: 0.744, frontIou: 0.744 },
      views: [
        { angle: 0, iou: 0.744 },
        { angle: 90, iou: 0.775 }
      ]
    },
    proposal: { automaticMasterOverwrite: false }
  });
  assert.equal(report.status, "REJECTED_KEEP_BASELINE");
  assert.equal(report.promotionEligible, false);
  assert.equal(report.checks.meanImproved, false);
  assert.equal(report.automaticMasterOverwrite, false);
});

test("rejects an unknown AI video provider", () => {
  const output = mkdtempSync(resolve(tmpdir(), "digital-human-ai-video-unknown-"));
  const result = spawnSync(
    process.execPath,
    [
      resolve(packageRoot, "bin/digital-human-pipeline.mjs"),
      "prepare-ai-video",
      "--project",
      fidelityWorkspace,
      "--provider",
      "unknown-provider",
      "--output",
      output
    ],
    { encoding: "utf8" }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AI_VIDEO_PROVIDER_UNKNOWN/);
});

test("selects the four cardinal views for a high-fidelity multi-image provider", () => {
  const manifest = JSON.parse(readFileSync(huihuiMultiviewManifest, "utf8"));
  const views = selectProviderViews(manifest, "meshy-multi-image");
  assert.deepEqual(views.map(view => view.angle), [0, 90, 180, 270]);
});

test("builds a governed AI 3D reconstruction plan without reading a secret", () => {
  const manifest = JSON.parse(readFileSync(huihuiMultiviewManifest, "utf8"));
  const output = mkdtempSync(resolve(tmpdir(), "huihui-ai-3d-plan-"));
  const plan = buildAi3dReconstructionPlan({
    providerId: "meshy-multi-image",
    manifest,
    manifestPath: huihuiMultiviewManifest,
    depthManifestPath: resolve(huihuiMultiviewManifest, "../depth-manifest.json"),
    outputRoot: output,
    credentialAvailable: false
  });
  assert.equal(plan.status, "AWAITING_APPROVAL_AND_CREDENTIAL_REFERENCE");
  assert.equal(plan.credentialReference.valueRead, false);
  assert.equal(plan.input.views.length, 4);
  assert.equal(plan.qualityGate.currentScaffoldMayNotPassAsFinal, true);
  assert.equal(plan.governance.automaticSubmissionAllowed, false);
});

test("reports local AI 3D runtime blockers instead of claiming readiness", () => {
  const providers = getAi3dProviderHealth({
    totalMemoryBytes: 16 * 1024 ** 3,
    meshyCredentialAvailable: false,
    huggingFaceAuthorized: false,
    stableFastModelAvailable: false,
    gpuWorkerAvailable: false
  });
  const stableFast = providers.find(provider => provider.providerId === "stable-fast-3d-local");
  const hunyuan = providers.find(provider => provider.providerId === "hunyuan3d-2mv-worker");
  assert.equal(stableFast.status, "BLOCKED");
  assert.ok(stableFast.blockers.includes("UNIFIED_MEMORY_BELOW_32_GB_RECOMMENDATION"));
  assert.equal(hunyuan.status, "BLOCKED");
  assert.ok(hunyuan.blockers.includes("NVIDIA_GPU_WORKER_REQUIRED"));
});

test("builds a Meshy multi-image dry-run preview without embedding image bytes or credentials", () => {
  const manifest = JSON.parse(readFileSync(huihuiMultiviewManifest, "utf8"));
  const output = mkdtempSync(resolve(tmpdir(), "huihui-meshy-preview-"));
  const plan = buildAi3dReconstructionPlan({
    providerId: "meshy-multi-image",
    manifest,
    manifestPath: huihuiMultiviewManifest,
    outputRoot: output,
    credentialAvailable: false
  });
  const preview = buildMeshySubmissionPreview(plan);
  assert.equal(preview.endpoint, "https://api.meshy.ai/openapi/v1/multi-image-to-3d");
  assert.equal(preview.authentication.credentialValueIncluded, false);
  assert.equal(preview.payload.imageCount, 4);
  assert.ok(preview.payload.images.every(image => image.transport === "base64_data_uri_at_execution_boundary"));
  assert.equal(preview.payload.should_texture, false);
  assert.equal(preview.payload.enable_pbr, false);
  assert.equal(preview.payload.should_remesh, false);
  assert.equal(preview.payload.image_enhancement, false);
  assert.deepEqual(preview.payload.target_formats, ["glb", "obj", "stl"]);
});

test("requires cost approval before submitting an AI 3D provider job", async () => {
  const manifest = JSON.parse(readFileSync(huihuiMultiviewManifest, "utf8"));
  const output = mkdtempSync(resolve(tmpdir(), "huihui-meshy-submit-"));
  const plan = buildAi3dReconstructionPlan({
    providerId: "meshy-multi-image",
    manifest,
    manifestPath: huihuiMultiviewManifest,
    outputRoot: output,
    credentialAvailable: true
  });
  await assert.rejects(
    submitMeshyMultiImage(plan, { env: { MESHY_API_KEY: "execution-only" } }),
    error => error.code === "MESHY_3D_COST_APPROVAL_REQUIRED"
  );
});

test("builds a Meshy-6 text geometry preview with assembly constraints", () => {
  const plan = JSON.parse(readFileSync(meshyTextPlan, "utf8"));
  const preview = buildMeshyTextSubmissionPreview(plan);
  assert.equal(preview.provider, "meshy-text-to-3d");
  assert.equal(preview.payload.mode, "preview");
  assert.equal(preview.payload.ai_model, "meshy-6");
  assert.equal(preview.payload.should_remesh, false);
  assert.match(preview.payload.prompt, /Clearly assembled separate parts/);
  assert.match(preview.payload.prompt, /No fused parts/);
  assert.equal(preview.authentication.credentialValueIncluded, false);
});

test("submits and audits Meshy text geometry only after cost approval", async () => {
  const plan = JSON.parse(readFileSync(meshyTextPlan, "utf8"));
  await assert.rejects(
    submitMeshyTextPreview(plan, { env: { MESHY_API_KEY: "execution-only" } }),
    /MESHY_3D_COST_APPROVAL_REQUIRED/
  );
  const submission = await submitMeshyTextPreview(plan, {
    costApproved: true,
    env: { MESHY_API_KEY: "execution-only" },
    fetchImpl: async (_url, options) => ({
      ok: true,
      status: 200,
      text: async () => {
        const payload = JSON.parse(options.body);
        assert.equal(payload.mode, "preview");
        assert.equal(payload.should_remesh, false);
        assert.ok(!options.body.includes("execution-only"));
        return JSON.stringify({ result: "text-task-1" });
      }
    })
  });
  const preview = buildMeshyTextSubmissionPreview(plan);
  const audit = createMeshyTextSubmissionAudit(plan, preview, submission);
  assert.equal(submission.taskId, "text-task-1");
  assert.equal(audit.credential.credentialValuePersisted, false);
  assert.equal(audit.request.authorizationHeaderPersisted, false);
});

test("queries Meshy text geometry from the text-to-3d endpoint", async () => {
  let requestedUrl = "";
  const task = await getMeshyTextTask("text-task-1", {
    env: { MESHY_API_KEY: "execution-only" },
    fetchImpl: async url => {
      requestedUrl = url;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: "text-task-1",
          status: "SUCCEEDED",
          progress: 100,
          model_urls: { glb: "https://provider.invalid/candidate.glb" }
        })
      };
    }
  });
  assert.match(requestedUrl, /\/openapi\/v2\/text-to-3d\/text-task-1$/);
  assert.equal(task.status, "SUCCEEDED");
  assert.equal(task.modelUrls.glb, "https://provider.invalid/candidate.glb");
});

test("reports Meshy credential presence without reading its value", () => {
  const availability = getMeshyCredentialAvailability(
    { MESHY_API_KEY: "" },
    { keychainProbe: () => true }
  );
  assert.equal(availability.available, true);
  assert.equal(availability.keychainConfigured, true);
  assert.equal(availability.credentialValueRead, false);
});

test("printable refinement requires an explicit mesh, manifest and output", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(packageRoot, "bin/digital-human-pipeline.mjs"), "refine-printable"],
    { encoding: "utf8" }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DIGITAL_HUMAN_PRINTABLE_MESH_REQUIRED/);
});

test("printable package status requires an explicit package manifest", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(packageRoot, "bin/digital-human-pipeline.mjs"), "printable-status"],
    { encoding: "utf8" }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DIGITAL_HUMAN_PRINTABLE_PACKAGE_REQUIRED/);
});

test("printable release requires visual, slicer and 60 mm proof evidence", () => {
  const root = mkdtempSync(resolve(tmpdir(), "digital-human-printable-release-"));
  const artifactKeys = [
    "refinedGlb",
    "baseStl",
    "assemblyStl",
    "blenderSource",
    "colorTurntableContactSheet",
    "clayTurntableContactSheet",
    "silhouetteContactSheet",
    "printabilityReport",
    "silhouetteReport"
  ];
  const artifacts = Object.fromEntries(
    artifactKeys.map(key => {
      const path = resolve(root, `${key}.artifact`);
      writeFileSync(path, key);
      return [key, path];
    })
  );
  const packagePath = resolve(root, "printable-asset-package.json");
  writeFileSync(
    packagePath,
    JSON.stringify({
      assetId: "test-printable",
      source: { providerMesh: resolve(root, "provider.glb") },
      refinement: { status: "REFINED_CANDIDATE_READY" },
      gates: { geometry: "PASS_WITH_CONDITIONS", silhouette: "PASS" },
      artifacts
    })
  );
  const legacyProofPath = resolve(root, "legacy-proof.json");
  writeFileSync(legacyProofPath, JSON.stringify({ status: "PASS" }));
  const legacyResult = spawnSync(
    process.execPath,
    [
      resolve(packageRoot, "bin/digital-human-pipeline.mjs"),
      "printable-status",
      "--package",
      packagePath,
      "--physical-proof",
      legacyProofPath
    ],
    { encoding: "utf8" }
  );
  assert.equal(legacyResult.status, 0, legacyResult.stderr);
  const legacyReport = JSON.parse(legacyResult.stdout);
  assert.equal(legacyReport.status, "READY_FOR_VISUAL_AND_PHYSICAL_PROOF");
  assert.equal(legacyReport.releaseBlocked, true);

  const evidencePath = resolve(root, "release-evidence.json");
  const slicerReportPath = resolve(root, "slicer-report.json");
  const frontPhotoPath = resolve(root, "proof-front.jpg");
  const rearPhotoPath = resolve(root, "proof-rear.jpg");
  writeFileSync(slicerReportPath, "{}");
  writeFileSync(frontPhotoPath, "front");
  writeFileSync(rearPhotoPath, "rear");
  writeFileSync(
    evidencePath,
    JSON.stringify({
      assetId: "test-printable",
      visualOwnerReview: {
        status: "PASS",
        reviewedBy: "visual-owner",
        reviewedAt: "2026-07-28T10:00:00.000Z",
        notes: "Approved proportions and identity."
      },
      slicerReview: {
        status: "PASS",
        reviewedBy: "print-engineer",
        reviewedAt: "2026-07-28T10:05:00.000Z",
        notes: "Wall, support and self-intersection checks passed.",
        minimumWallMm: 1.6,
        selfIntersectionCheck: "PASS",
        supportReview: "PASS",
        reportPath: slicerReportPath
      },
      physical60mmProof: {
        status: "PASS",
        reviewedBy: "visual-owner",
        reviewedAt: "2026-07-28T11:00:00.000Z",
        notes: "60 mm proof approved.",
        printedHeightMm: 60,
        photoPaths: [frontPhotoPath, rearPhotoPath]
      }
    })
  );
  const result = spawnSync(
    process.execPath,
    [
      resolve(packageRoot, "bin/digital-human-pipeline.mjs"),
      "printable-status",
      "--package",
      packagePath,
      "--release-evidence",
      evidencePath
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "READY_FOR_RELEASE_REVIEW");
  assert.equal(report.releaseBlocked, false);
  assert.equal(report.stages.find(stage => stage.stage === "VISUAL_OWNER_REVIEW").status, "PASS");
  assert.equal(report.stages.find(stage => stage.stage === "SLICER_WALL_AND_SUPPORT_REVIEW").status, "PASS");
  assert.equal(report.stages.find(stage => stage.stage === "PHYSICAL_60MM_PROOF").status, "PASS");
});

test("printable refinement scripts preserve the source and require physical proof", () => {
  const blenderScript = readFileSync(
    resolve(packageRoot, "blender/refine_provider_candidate.py"),
    "utf8"
  );
  const validator = readFileSync(
    resolve(packageRoot, "python/validate_printable_mesh.py"),
    "utf8"
  );
  assert.match(blenderScript, /sourceProviderMeshModifiedInPlace/);
  assert.match(blenderScript, /watertight_base/);
  assert.match(validator, /MANUAL_OR_SLICER_VERIFICATION_REQUIRED/);
  assert.match(validator, /60 mm proof/);
});

function createKlingTestPlan(root) {
  const startFrame = resolve(root, "start.png");
  const endFrame = resolve(root, "end.png");
  writeFileSync(startFrame, Buffer.from("test-start-frame"));
  writeFileSync(endFrame, Buffer.from("test-end-frame"));
  return {
    schemaVersion: 1,
    jobId: "kling-test-job",
    status: "AWAITING_APPROVAL_AND_CREDENTIAL_REFERENCE",
    executionMode: "external_provider",
    provider: { providerId: "kling-ai" },
    credentialReference: { type: "env_ref", reference: "kling-api-key-ref", valueRead: false },
    input: {
      startFrame,
      endFrame,
      prompt: "灰灰站在水泥二厂主路并向镜头挥手。",
      negativePrompt: "漂浮, 变形",
      durationSeconds: 6,
      resolution: { width: 1920, height: 1080 },
      nativeAudio: false
    },
    governance: {
      risk: "MEDIUM",
      requiresCostApproval: true,
      requiresCredentialReference: true
    },
    output: {
      artifactRoot: root,
      auditRecord: "provider-submission-audit.json"
    }
  };
}

test("builds a Kling overseas dry-run preview without reading a credential", () => {
  const root = mkdtempSync(resolve(tmpdir(), "kling-preview-"));
  const plan = createKlingTestPlan(root);
  const preview = buildKlingSubmissionPreview(plan);
  assert.equal(preview.endpoint, "https://api-singapore.klingai.com/image-to-video/kling-3.0");
  assert.equal(preview.authentication.environmentVariable, "KLING_API_KEY");
  assert.equal(preview.authentication.keychainReference.service, "com.anksen.agent-studio.kling-api");
  assert.equal(preview.authentication.credentialValueIncluded, false);
  assert.equal(preview.payload.settings.duration, 6);
  assert.equal(preview.payload.contents[2].type, "last_frame");
});

test("reports Kling credential presence without reading its value", () => {
  const availability = getKlingCredentialAvailability(
    { KLING_API_KEY: "" },
    { keychainProbe: () => true }
  );
  assert.equal(availability.available, true);
  assert.equal(availability.environmentConfigured, false);
  assert.equal(availability.keychainConfigured, true);
  assert.equal(availability.credentialValueRead, false);
});

test("resolves a Kling keychain value only at the execution boundary", () => {
  const apiKey = resolveKlingApiKey(
    {},
    {
      allowKeychain: true,
      keychainReader: () => "execution-only-key"
    }
  );
  assert.equal(apiKey, "execution-only-key");
});

test("submits current Kling payload only after cost approval", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "kling-submit-"));
  const plan = createKlingTestPlan(root);
  await assert.rejects(
    submitKlingImageToVideo(plan, { env: { KLING_API_KEY: "not-persisted" } }),
    error => error.code === "KLING_COST_APPROVAL_REQUIRED"
  );
  let request;
  const result = await submitKlingImageToVideo(plan, {
    costApproved: true,
    env: { KLING_API_KEY: "not-persisted" },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(
        JSON.stringify({
          code: 0,
          request_id: "request-1",
          data: { id: "task-1", status: "submitted", external_id: "kling-test-job" }
        }),
        { status: 200 }
      );
    }
  });
  const payload = JSON.parse(request.options.body);
  assert.equal(request.url, "https://api-singapore.klingai.com/image-to-video/kling-3.0");
  assert.equal(request.options.headers.authorization, "Bearer not-persisted");
  assert.equal(payload.contents[0].type, "prompt");
  assert.equal(payload.contents[1].type, "first_frame");
  assert.equal(payload.contents[2].type, "last_frame");
  assert.equal(payload.settings.resolution, "1080p");
  assert.equal(result.taskId, "task-1");
});

test("queries Kling tasks and keeps provider URLs out of audit records", async () => {
  const task = await getKlingTask("task-1", {
    env: { KLING_API_KEY: "not-persisted" },
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          code: 0,
          request_id: "request-2",
          data: [
            {
              id: "task-1",
              status: "succeeded",
              outputs: [{ type: "video", url: "https://temporary.example/video.mp4", duration: "6" }],
              billing: [{ resource: "video" }]
            }
          ]
        }),
        { status: 200 }
      )
  });
  const root = mkdtempSync(resolve(tmpdir(), "kling-audit-"));
  const plan = createKlingTestPlan(root);
  const preview = buildKlingSubmissionPreview(plan);
  const audit = updateKlingTaskAudit(
    createKlingSubmissionAudit(plan, preview, {
      requestId: "request-1",
      taskId: "task-1",
      externalTaskId: "kling-test-job",
      status: "submitted"
    }),
    task
  );
  const serialized = JSON.stringify(audit);
  assert.equal(audit.providerResult.videoOutputAvailable, true);
  assert.equal(audit.providerResult.resultUrlPersisted, false);
  assert.equal(serialized.includes("temporary.example"), false);
  assert.equal(serialized.includes("not-persisted"), false);
});
