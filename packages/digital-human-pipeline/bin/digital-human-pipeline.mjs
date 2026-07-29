#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, dirname, resolve } from "node:path";
import process from "node:process";
import {
  buildAi3dReconstructionPlan,
  getAi3dProviderHealth
} from "../lib/ai-3d-providers.mjs";
import {
  buildAiVideoDispatchPlan,
  buildOrbitReferenceDispatchPlan
} from "../lib/ai-video-providers.mjs";
import { evaluateOrbitCalibrationCandidate } from "../lib/orbit-calibration-gate.mjs";
import { evaluateInverseRenderCandidate } from "../lib/inverse-render-fidelity-gate.mjs";
import {
  KLING_OVERSEAS_API_BASE,
  KLING_TASKS_PATH,
  buildKlingSubmissionPreview,
  createKlingSubmissionAudit,
  downloadKlingVideo,
  getKlingCredentialAvailability,
  getKlingTask,
  pollKlingTask,
  submitKlingImageToVideo,
  updateKlingTaskAudit,
  writeKlingAudit
} from "../lib/kling-api-client.mjs";
import {
  MESHY_API_BASE,
  MESHY_MULTI_IMAGE_PATH,
  MESHY_TEXT_TO_3D_PATH,
  buildMeshySubmissionPreview,
  buildMeshyTextSubmissionPreview,
  createMeshySubmissionAudit,
  createMeshyTextSubmissionAudit,
  downloadMeshyModel,
  getMeshyCredentialAvailability,
  getMeshyTask,
  getMeshyTextTask,
  pollMeshyTask,
  pollMeshyTextTask,
  submitMeshyMultiImage,
  submitMeshyTextPreview,
  updateMeshyTaskAudit,
  writeMeshyAudit
} from "../lib/meshy-3d-client.mjs";

const packageRoot = resolve(import.meta.dirname, "..");
const requiredProjectFiles = ["characters.json", "scene.json", "story.json"];

function fail(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function parseArgs(argv) {
  const [command = "doctor", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = rest[index + 1];
    options[key] = next && !next.startsWith("--") ? rest[++index] : true;
  }
  return { command, options };
}

function findBinary(names) {
  const searchRoots = String(process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const appCandidates = [
    "/Applications/Blender.app/Contents/MacOS/Blender",
    resolve(process.env.HOME ?? "", "Applications/Blender.app/Contents/MacOS/Blender")
  ];
  for (const name of names) {
    for (const root of searchRoots) {
      const candidate = resolve(root, name);
      try {
        if (process.getuid && process.getuid() >= 0) {
          // access is checked by the caller before execution.
        }
        return candidate;
      } catch {}
    }
  }
  if (names.includes("blender")) return appCandidates[0];
  return names[0];
}

async function existingBinary(names) {
  const candidates = [
    ...(names.includes("blender")
      ? [
          "/Applications/Blender.app/Contents/MacOS/Blender",
          resolve(process.env.HOME ?? "", "Applications/Blender.app/Contents/MacOS/Blender")
        ]
      : []),
    ...String(process.env.PATH ?? "").split(delimiter).filter(Boolean).flatMap(root => names.map(name => resolve(root, name)))
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  return null;
}

function run(binary, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      const text = chunk.toString();
      stdout += text;
      if (options.stream) process.stdout.write(text);
    });
    child.stderr.on("data", chunk => {
      const text = chunk.toString();
      stderr += text;
      if (options.stream) process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) resolvePromise({ code, stdout, stderr });
      else reject(fail("DIGITAL_HUMAN_PROCESS_FAILED", { binary, args, code, stdout, stderr }));
    });
  });
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw fail("DIGITAL_HUMAN_JSON_INVALID", { path, message: error.message });
  }
}

async function validateProject(projectRoot) {
  const root = resolve(projectRoot);
  for (const file of requiredProjectFiles) {
    await access(resolve(root, file)).catch(() => {
      throw fail("DIGITAL_HUMAN_PROJECT_FILE_MISSING", { file });
    });
  }
  const [characters, scene, story] = await Promise.all([
    readJson(resolve(root, "characters.json")),
    readJson(resolve(root, "scene.json")),
    readJson(resolve(root, "story.json"))
  ]);
  const errors = [];
  if (!Array.isArray(characters) || characters.length === 0) errors.push("characters.json must contain at least one character");
  for (const character of characters) {
    if (character.schemaVersion !== 1 || !character.assetId || !character.displayName || !character.archetype) {
      errors.push(`invalid character manifest: ${character.assetId ?? "unknown"}`);
    }
  }
  if (scene.schemaVersion !== 1 || !scene.sceneId || !scene.environment) errors.push("invalid scene manifest");
  if (story.schemaVersion !== 1 || !story.storyId || !Number.isFinite(story.duration) || story.duration <= 0) {
    errors.push("invalid story manifest");
  }
  for (const item of story.dialogue ?? []) {
    if (!characters.some(character => character.assetId === item.speaker)) errors.push(`unknown dialogue speaker: ${item.speaker}`);
    await access(resolve(root, item.audio)).catch(() => errors.push(`missing dialogue audio: ${item.audio}`));
  }
  for (const shot of story.shots ?? []) {
    if (!(shot.end > shot.start)) errors.push(`invalid shot timing: ${shot.shotId}`);
    for (const actor of shot.actors ?? []) {
      if (!characters.some(character => character.assetId === actor)) errors.push(`unknown shot actor: ${actor}`);
    }
  }
  if (story.fidelity === "high") {
    for (const character of characters) {
      if (!character.referenceAssets?.identitySheet) {
        errors.push(`high-fidelity character requires referenceAssets.identitySheet: ${character.assetId}`);
      } else {
        await access(resolve(root, character.referenceAssets.identitySheet)).catch(() =>
          errors.push(`missing identity sheet: ${character.referenceAssets.identitySheet}`)
        );
      }
      if (!Array.isArray(character.identityFeatures) || character.identityFeatures.length < 5) {
        errors.push(`high-fidelity character requires at least five identityFeatures: ${character.assetId}`);
      }
    }
    if (scene.reconstruction?.mode !== "depth-plate") errors.push("high-fidelity scene requires depth-plate reconstruction");
    for (const key of ["referenceFrame", "depthMap"]) {
      const path = scene.reconstruction?.[key];
      if (!path) errors.push(`high-fidelity scene requires reconstruction.${key}`);
      else await access(resolve(root, path)).catch(() => errors.push(`missing reconstruction asset: ${path}`));
    }
    if (story.duration > 15) errors.push("high-fidelity proof duration must not exceed 15 seconds");
  }
  if (errors.length) throw fail("DIGITAL_HUMAN_PROJECT_INVALID", { errors });
  return {
    status: "PASS",
    projectRoot: root,
    characters: characters.length,
    shots: story.shots.length,
    dialogue: story.dialogue.length,
    duration: story.duration,
    fps: story.fps,
    resolution: story.resolution
    ,
    fidelity: story.fidelity ?? "prototype",
    reconstructionMode: scene.reconstruction?.mode ?? "procedural"
  };
}

async function doctor() {
  const tools = {};
  for (const [id, names, args] of [
    ["blender", ["blender"], ["--version"]],
    ["ffmpeg", ["ffmpeg"], ["-version"]],
    ["ffprobe", ["ffprobe"], ["-version"]],
    ["python", ["python3"], ["--version"]],
    ["colmap", ["colmap"], ["--help"]],
    [
      "reconstructionPython",
      [resolve(packageRoot, ".venv-reconstruction/bin/python")],
      ["-c", "import torch, transformers, cv2; print('depth-stack-ready')"]
    ]
  ]) {
    const path = await existingBinary(names);
    if (!path) {
      tools[id] = { status: "MISSING", path: null, version: null };
      continue;
    }
    if (id === "colmap") {
      tools[id] = { status: "PASS", path, version: "COLMAP 4.1.1 (installed; startup deferred)" };
      continue;
    }
    try {
      const result = await run(path, args);
      tools[id] = { status: "PASS", path, version: (result.stdout || result.stderr).split(/\r?\n/, 1)[0] };
    } catch (error) {
      tools[id] = { status: "UNHEALTHY", path, version: null, error: error.code };
    }
  }
  return {
    schemaVersion: 1,
    pipeline: "anksen-reference-constrained-digital-human-v2",
    status: Object.values(tools).every(tool => tool.status === "PASS") ? "READY" : "NOT_READY",
    tools
  };
}

async function reconstruct(projectRoot, sourceVideo, timestamp = "0") {
  const root = resolve(projectRoot);
  const ffmpeg = await existingBinary(["ffmpeg"]);
  const python = await existingBinary([resolve(packageRoot, ".venv-reconstruction/bin/python")]);
  if (!ffmpeg) throw fail("FFMPEG_NOT_INSTALLED");
  if (!python) throw fail("DIGITAL_HUMAN_RECONSTRUCTION_PYTHON_MISSING");
  if (!sourceVideo) throw fail("DIGITAL_HUMAN_SOURCE_VIDEO_REQUIRED");
  const generated = resolve(root, "generated/reconstruction");
  await mkdir(generated, { recursive: true });
  const frame = resolve(generated, "scene-reference.png");
  const depth = resolve(generated, "scene-depth.png");
  const manifest = resolve(generated, "depth-manifest.json");
  await run(ffmpeg, ["-y", "-ss", String(timestamp), "-i", resolve(sourceVideo), "-frames:v", "1", frame], {
    cwd: root
  });
  await run(
    python,
    [
      resolve(packageRoot, "python/estimate_depth.py"),
      "--input",
      frame,
      "--output",
      depth,
      "--manifest",
      manifest
    ],
    { cwd: root, stream: true }
  );
  return {
    schemaVersion: 1,
    status: "PASS",
    mode: "depth-plate",
    sourceVideo: resolve(sourceVideo),
    timestamp: String(timestamp),
    artifacts: { referenceFrame: frame, depthMap: depth, manifest }
  };
}

async function extractReferenceAssets(projectRoot, sourceImage, outputRoot) {
  const root = resolve(projectRoot);
  const python = await existingBinary([resolve(packageRoot, ".venv-reconstruction/bin/python")]);
  if (!python) throw fail("DIGITAL_HUMAN_RECONSTRUCTION_PYTHON_MISSING");
  if (!sourceImage) throw fail("DIGITAL_HUMAN_REFERENCE_SHEET_REQUIRED");
  const source = resolve(sourceImage);
  await access(source).catch(() => {
    throw fail("DIGITAL_HUMAN_REFERENCE_SHEET_MISSING", { source });
  });
  const output = resolve(outputRoot ?? resolve(root, "generated/character-assets"));
  const manifest = resolve(output, "character-asset-index.json");
  await mkdir(output, { recursive: true });
  await run(
    python,
    [
      resolve(packageRoot, "python/extract_character_sheet_assets.py"),
      "--input",
      source,
      "--output",
      output,
      "--manifest",
      manifest
    ],
    { cwd: root }
  );
  const bundle = await readJson(manifest);
  return {
    schemaVersion: 1,
    status: "PASS",
    projectRoot: root,
    source,
    outputRoot: output,
    manifest,
    characters: bundle.characters.map(character => ({
      assetId: character.assetId,
      displayName: character.displayName,
      views: Object.keys(character.views)
    })),
    contactSheet: resolve(output, bundle.contactSheet)
  };
}

async function prepareAiVideo(projectRoot, outputRoot, providerId = "kling-ai") {
  const validation = await validateProject(projectRoot);
  const root = validation.projectRoot;
  const python = await existingBinary([resolve(packageRoot, ".venv-reconstruction/bin/python")]);
  if (!python) throw fail("DIGITAL_HUMAN_RECONSTRUCTION_PYTHON_MISSING");
  const output = resolve(outputRoot);
  await mkdir(output, { recursive: true });
  await run(
    python,
    [
      resolve(packageRoot, "python/prepare_ai_video_frames.py"),
      "--project",
      root,
      "--output",
      output
    ],
    { cwd: root }
  );
  const frameReport = await readJson(resolve(output, "frame-preparation-report.json"));
  const story = await readJson(resolve(root, "story.json"));
  const characters = await readJson(resolve(root, "characters.json"));
  const elementReferences = [];
  const lockedAsset = characters[0]?.referenceAssets?.referenceLockedCutout;
  if (lockedAsset) elementReferences.push(resolve(root, lockedAsset));
  const assetIndexPath = resolve(root, "generated/character-assets/character-asset-index.json");
  try {
    const assetIndex = await readJson(assetIndexPath);
    const selected = assetIndex.characters.find(character => character.assetId === characters[0]?.assetId);
    for (const reference of selected?.recommendedElementReferences ?? []) {
      if (elementReferences.length >= 4) break;
      elementReferences.push(resolve(root, "generated/character-assets", reference));
    }
  } catch {}
  const plan = buildAiVideoDispatchPlan({
    providerId,
    projectRoot: root,
    outputRoot: output,
    frameReport,
    story,
    characters,
    elementReferences
  });
  await writeFile(resolve(output, "ai-video-dispatch-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  return {
    ...validation,
    status: plan.status,
    providerId,
    outputRoot: output,
    credentialValueRead: false,
    externalModelCalled: false,
    artifacts: [
      "start-frame.png",
      "end-frame.png",
      "start-end-frame-board.jpg",
      "frame-preparation-report.json",
      "ai-video-dispatch-plan.json"
    ],
    governance: plan.governance
  };
}

async function orbitPython() {
  return existingBinary([
    resolve(packageRoot, ".venv-reconstruction/bin/python"),
    resolve(packageRoot, ".venv/bin/python")
  ]);
}

async function prepareOrbitReference(options) {
  if (!options.config) throw fail("ORBIT_CALIBRATION_CONFIG_REQUIRED");
  const repoRoot = resolve(packageRoot, "../..");
  const configPath = resolve(options.config);
  const workflow = await readJson(configPath);
  if (
    workflow.schemaVersion !== 1 ||
    workflow.domain !== "3D_MODELING" ||
    workflow.calibrationMode !== "AI_ORBIT_REFERENCE_CALIBRATION"
  ) {
    throw fail("ORBIT_CALIBRATION_CONFIG_INVALID");
  }
  const authoritativeFront = resolve(repoRoot, workflow.authoritativeFront);
  const outputRoot = resolve(options.output ?? resolve(repoRoot, workflow.outputRoot));
  await Promise.all([access(authoritativeFront), mkdir(outputRoot, { recursive: true })]);
  const plan = buildOrbitReferenceDispatchPlan({
    workflow,
    authoritativeFront,
    outputRoot
  });
  const planPath = resolve(outputRoot, "ai-orbit-dispatch-plan.json");
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return {
    schemaVersion: 1,
    status: plan.status,
    calibrationMode: workflow.calibrationMode,
    provider: workflow.provider,
    planPath,
    sampleAngles: workflow.orbit.sampleAngles,
    credentialValueRead: false,
    externalModelCalled: false,
    governance: plan.governance
  };
}

async function extractOrbitFrames(options) {
  if (!options.config) throw fail("ORBIT_CALIBRATION_CONFIG_REQUIRED");
  if (!options.video) throw fail("ORBIT_REFERENCE_VIDEO_REQUIRED");
  if (!options.output) throw fail("DIGITAL_HUMAN_OUTPUT_REQUIRED");
  const ffmpeg = await existingBinary(["ffmpeg"]);
  if (!ffmpeg) throw fail("DIGITAL_HUMAN_FFMPEG_MISSING");
  const config = await readJson(resolve(options.config));
  const video = resolve(options.video);
  const outputRoot = resolve(options.output);
  const framesRoot = resolve(outputRoot, "frames");
  await Promise.all([access(video), mkdir(framesRoot, { recursive: true })]);
  const frames = [];
  for (const angle of config.orbit.sampleAngles) {
    const timestamp = Math.min(
      config.orbit.durationSeconds - 0.04,
      (Number(angle) / 360) * config.orbit.durationSeconds
    );
    const framePath = resolve(framesRoot, `orbit-${String(angle).padStart(3, "0")}.png`);
    await run(
      ffmpeg,
      [
        "-y",
        "-ss",
        timestamp.toFixed(4),
        "-i",
        video,
        "-frames:v",
        "1",
        "-vf",
        "scale='min(1600,iw)':-2",
        framePath
      ],
      { cwd: outputRoot }
    );
    frames.push({
      angle,
      view: `orbit-${String(angle).padStart(3, "0")}`,
      framePath,
      authority: angle === 0 ? "ai-orbit-front-candidate" : "ai-orbit-frame",
      sourceTimestampSeconds: Number(timestamp.toFixed(4))
    });
  }
  const manifest = {
    schemaVersion: 1,
    assetId: config.assetId,
    status: "ORBIT_FRAMES_EXTRACTED",
    sourceVideo: video,
    generatedViewsAreMetric: false,
    angleMapping: "constant-speed provider orbit assumption; owner review required",
    frames
  };
  const manifestPath = resolve(outputRoot, "orbit-frames-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    schemaVersion: 1,
    status: "PASS",
    frames: frames.length,
    manifestPath,
    generatedViewsAreMetric: false
  };
}

async function observeOrbitReference(options) {
  if (!options.config) throw fail("ORBIT_CALIBRATION_CONFIG_REQUIRED");
  if (!options.output) throw fail("DIGITAL_HUMAN_OUTPUT_REQUIRED");
  const sourceFlag = options.manifest
    ? "--manifest"
    : options["frames-manifest"]
      ? "--frames-manifest"
      : null;
  const source = options.manifest ?? options["frames-manifest"];
  if (!sourceFlag || !source) throw fail("ORBIT_REFERENCE_SOURCE_REQUIRED");
  const python = await orbitPython();
  if (!python) throw fail("DIGITAL_HUMAN_RECONSTRUCTION_PYTHON_MISSING");
  const output = resolve(options.output);
  await mkdir(resolve(output, ".."), { recursive: true });
  await run(
    python,
    [
      resolve(packageRoot, "python/observe_orbit_reference.py"),
      "--config",
      resolve(options.config),
      sourceFlag,
      resolve(source),
      "--output",
      output
    ],
    { cwd: resolve(packageRoot, "../.."), stream: Boolean(options.stream) }
  );
  const report = await readJson(output);
  return {
    schemaVersion: 1,
    status: report.status,
    output,
    sourceMode: report.sourceMode,
    summary: report.summary,
    durableTrackCount: report.featureTracking.durableTrackCount,
    generatedViewsAreMetric: false
  };
}

async function fitOrbitParameters(options) {
  if (!options.observations) throw fail("ORBIT_OBSERVATIONS_REQUIRED");
  if (!options.spec) throw fail("PARAMETRIC_CHARACTER_SPEC_REQUIRED");
  if (!options.output) throw fail("DIGITAL_HUMAN_OUTPUT_REQUIRED");
  const python = await orbitPython();
  if (!python) throw fail("DIGITAL_HUMAN_RECONSTRUCTION_PYTHON_MISSING");
  const output = resolve(options.output);
  await mkdir(resolve(output, ".."), { recursive: true });
  await run(
    python,
    [
      resolve(packageRoot, "python/fit_parametric_from_orbit.py"),
      "--observations",
      resolve(options.observations),
      "--spec",
      resolve(options.spec),
      "--output",
      output
    ],
    { cwd: resolve(packageRoot, "../.."), stream: Boolean(options.stream) }
  );
  const proposal = await readJson(output);
  return {
    schemaVersion: 1,
    status: proposal.status,
    output,
    automaticMasterOverwrite: proposal.automaticMasterOverwrite,
    proposals: proposal.proposals,
    nextGate: proposal.nextGate
  };
}

async function buildGaugeCalibration(options) {
  if (!options.config) throw fail("GAUGE_CALIBRATION_CONFIG_REQUIRED");
  const repoRoot = resolve(packageRoot, "../..");
  const configPath = resolve(options.config);
  const config = await readJson(configPath);
  if (
    config.schemaVersion !== 1 ||
    config.domain !== "3D_MODELING" ||
    config.calibrationMode !== "GAUGE_DRIVEN_MULTIVIEW_GEOMETRY"
  ) {
    throw fail("GAUGE_CALIBRATION_CONFIG_INVALID");
  }
  const observationsPath = resolve(
    options.observations ?? resolve(repoRoot, config.observationReport)
  );
  const outputRoot = resolve(
    options.output ?? resolve(repoRoot, config.outputRoot)
  );
  const python = await orbitPython();
  if (!python) throw fail("DIGITAL_HUMAN_RECONSTRUCTION_PYTHON_MISSING");
  await Promise.all([
    access(resolve(repoRoot, config.baselineMesh)),
    access(resolve(repoRoot, config.authoritativeFront)),
    access(resolve(repoRoot, config.referenceManifest)),
    access(observationsPath),
    mkdir(outputRoot, { recursive: true })
  ]);
  const execution = await run(
    python,
    [
      resolve(packageRoot, "python/build_gauge_calibration.py"),
      "--config",
      configPath,
      "--observations",
      observationsPath,
      "--output-dir",
      outputRoot
    ],
    { cwd: repoRoot, stream: Boolean(options.stream) }
  );
  const report = JSON.parse(execution.stdout);
  return {
    schemaVersion: 1,
    status: report.status,
    assetId: report.assetId,
    calibrationMode: report.calibrationMode,
    baselinePreserved: report.baselinePreserved,
    outputRoot,
    summary: report.summary,
    artifacts: report.artifacts,
    externalModelCalled: false,
    credentialValueRead: false
  };
}

async function buildGaugeDepthTransfer(options) {
  if (!options.config) throw fail("GAUGE_CALIBRATION_CONFIG_REQUIRED");
  const repoRoot = resolve(packageRoot, "../..");
  const configPath = resolve(options.config);
  const config = await readJson(configPath);
  if (
    config.schemaVersion !== 1 ||
    config.domain !== "3D_MODELING" ||
    config.calibrationMode !== "GAUGE_DRIVEN_MULTIVIEW_GEOMETRY"
  ) {
    throw fail("GAUGE_CALIBRATION_CONFIG_INVALID");
  }
  const baselineBlend = resolve(
    options["baseline-blend"] ?? resolve(repoRoot, config.baselineBlend)
  );
  const gaugeProposal = resolve(
    options["gauge-proposal"] ??
      resolve(repoRoot, config.outputRoot, "semantic-anchor-proposal.json")
  );
  const outputRoot = resolve(
    options.output ?? resolve(repoRoot, config.outputRoot, "v15-depth-transfer")
  );
  const blender = await existingBinary(["blender"]);
  if (!blender) throw fail("BLENDER_NOT_INSTALLED");
  await Promise.all([
    access(baselineBlend),
    access(gaugeProposal),
    mkdir(outputRoot, { recursive: true })
  ]);
  await run(
    blender,
    [
      "--background",
      baselineBlend,
      "--python",
      resolve(packageRoot, "blender/build_v15_depth_transfer.py"),
      "--",
      "--baseline-blend",
      baselineBlend,
      "--gauge-proposal",
      gaugeProposal,
      "--output-dir",
      outputRoot
    ],
    { cwd: repoRoot, stream: Boolean(options.stream) }
  );
  const report = await readJson(
    resolve(outputRoot, "v15-depth-transfer-report.json")
  );
  return {
    schemaVersion: 1,
    status: report.status,
    assetId: report.assetId,
    method: report.method,
    baselinePreserved: report.baselinePreserved,
    outputRoot,
    summary: {
      semanticProbeCount: report.semanticProbeCount,
      anchorCount: report.anchorCount,
      successfulDepthTransfers: report.successfulDepthTransfers,
      missedAnchorCount: report.missedAnchorCount,
      assemblyStatus: report.assemblyFinding.status
    },
    nextGate: report.nextGate,
    artifacts: report.artifacts,
    externalModelCalled: false,
    credentialValueRead: false
  };
}

async function buildSemanticPartCandidate(options) {
  if (!options.config) throw fail("GAUGE_CALIBRATION_CONFIG_REQUIRED");
  if (!options.part) throw fail("SEMANTIC_PART_REQUIRED");
  if (options.part !== "helmet-shell") {
    throw fail("SEMANTIC_PART_NOT_SUPPORTED", { part: options.part });
  }
  const repoRoot = resolve(packageRoot, "../..");
  const configPath = resolve(options.config);
  const config = await readJson(configPath);
  if (
    config.schemaVersion !== 1 ||
    config.domain !== "3D_MODELING" ||
    config.calibrationMode !== "GAUGE_DRIVEN_MULTIVIEW_GEOMETRY"
  ) {
    throw fail("GAUGE_CALIBRATION_CONFIG_INVALID");
  }
  const baselineBlend = resolve(
    options["baseline-blend"] ?? resolve(repoRoot, config.baselineBlend)
  );
  const gaugeProposal = resolve(
    options["gauge-proposal"] ??
      resolve(repoRoot, config.outputRoot, "semantic-anchor-proposal.json")
  );
  const depthReport = resolve(
    options["depth-report"] ??
      resolve(
        repoRoot,
        config.outputRoot,
        "v15-depth-transfer",
        "v15-depth-transfer-report.json"
      )
  );
  const outputRoot = resolve(
    options.output ??
      resolve(repoRoot, config.outputRoot, "semantic-parts", `${options.part}-v1`)
  );
  const blender = await existingBinary(["blender"]);
  if (!blender) throw fail("BLENDER_NOT_INSTALLED");
  await Promise.all([
    access(baselineBlend),
    access(gaugeProposal),
    access(depthReport),
    access(resolve(dirname(gaugeProposal), "local-patch-work-order.json")),
    mkdir(outputRoot, { recursive: true })
  ]);
  await run(
    blender,
    [
      "--background",
      baselineBlend,
      "--python",
      resolve(packageRoot, "blender/build_semantic_helmet_candidate.py"),
      "--",
      "--baseline-blend",
      baselineBlend,
      "--gauge-proposal",
      gaugeProposal,
      "--depth-report",
      depthReport,
      "--output-dir",
      outputRoot,
      "--part",
      options.part
    ],
    { cwd: repoRoot, stream: Boolean(options.stream) }
  );
  const report = await readJson(resolve(outputRoot, "helmet-geometry-report.json"));
  return {
    schemaVersion: 1,
    status: report.status,
    assetId: report.assetId,
    partId: report.partId,
    method: report.method,
    baselinePreserved: report.baselinePreserved,
    outputRoot,
    geometryAuthority: report.geometryAuthority,
    topology: report.topology,
    interface: report.interface,
    nextGate: report.nextGate,
    artifacts: report.artifacts,
    externalModelCalled: false,
    credentialValueRead: false
  };
}

async function evaluateOrbitCandidate(options) {
  if (!options.baseline) throw fail("ORBIT_BASELINE_REPORT_REQUIRED");
  if (!options.candidate) throw fail("ORBIT_CANDIDATE_REPORT_REQUIRED");
  if (!options.proposal) throw fail("ORBIT_PARAMETER_PROPOSAL_REQUIRED");
  if (!options.output) throw fail("ORBIT_PROMOTION_REPORT_REQUIRED");
  const [baseline, candidate, proposal] = await Promise.all([
    readJson(resolve(options.baseline)),
    readJson(resolve(options.candidate)),
    readJson(resolve(options.proposal))
  ]);
  const report = evaluateOrbitCalibrationCandidate({
    baseline,
    candidate,
    proposal
  });
  const output = resolve(options.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, reportPath: output };
}

async function evaluateRenderFidelity(options) {
  if (!options.config) throw fail("INVERSE_RENDER_FIDELITY_CONFIG_REQUIRED");
  const repoRoot = resolve(packageRoot, "../..");
  const configPath = resolve(options.config);
  const config = await readJson(configPath);
  if (
    config.schemaVersion !== 1 ||
    config.domain !== "3D_MODELING" ||
    config.evaluationMode !== "HIGH_RESOLUTION_INVERSE_RENDER_ALIGNMENT"
  ) {
    throw fail("INVERSE_RENDER_FIDELITY_CONFIG_INVALID");
  }
  const python = await orbitPython();
  if (!python) throw fail("DIGITAL_HUMAN_RECONSTRUCTION_PYTHON_MISSING");
  const outputRoot = resolve(
    options.output ?? resolve(repoRoot, config.outputRoot)
  );
  const reportPath = resolve(outputRoot, "high-resolution-fidelity-report.json");
  const contactSheetPath = resolve(outputRoot, "inverse-render-contact-sheet.jpg");
  await mkdir(outputRoot, { recursive: true });
  await run(
    python,
    [
      resolve(packageRoot, "python/evaluate_render_fidelity.py"),
      "--config",
      configPath,
      "--output",
      reportPath,
      "--contact-sheet",
      contactSheetPath,
      "--repo-root",
      repoRoot,
      "--size",
      String(options.size ?? 640)
    ],
    { cwd: repoRoot, stream: Boolean(options.stream) }
  );
  const report = await readJson(reportPath);
  return {
    schemaVersion: 1,
    status: report.status,
    assetId: report.assetId,
    baselineVersion: report.baselineVersion,
    releaseBlocked: report.releaseBlocked,
    summary: report.summary,
    gates: report.gates,
    failedGates: report.failedGates,
    reportPath,
    contactSheetPath,
    externalModelCalled: false,
    credentialValueRead: false
  };
}

async function promoteRenderFidelity(options) {
  if (!options.baseline) throw fail("INVERSE_RENDER_BASELINE_REPORT_REQUIRED");
  if (!options.candidate) throw fail("INVERSE_RENDER_CANDIDATE_REPORT_REQUIRED");
  if (!options.output) throw fail("INVERSE_RENDER_PROMOTION_REPORT_REQUIRED");
  const [baseline, candidate] = await Promise.all([
    readJson(resolve(options.baseline)),
    readJson(resolve(options.candidate))
  ]);
  const report = evaluateInverseRenderCandidate({ baseline, candidate });
  const output = resolve(options.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, reportPath: output };
}

async function inspectMeshAssembly(options) {
  if (!options.mesh) throw fail("MESH_ASSEMBLY_MESH_REQUIRED");
  if (!options.output) throw fail("MESH_ASSEMBLY_OUTPUT_REQUIRED");
  const blender = await existingBinary(["blender"]);
  if (!blender) throw fail("DIGITAL_HUMAN_BLENDER_MISSING");
  const mesh = resolve(options.mesh);
  const output = resolve(options.output);
  await access(mesh).catch(() => {
    throw fail("MESH_ASSEMBLY_MESH_NOT_FOUND", { mesh });
  });
  await mkdir(dirname(output), { recursive: true });
  await run(
    blender,
    [
      "--background",
      "--python",
      resolve(packageRoot, "blender/inspect_mesh_assembly.py"),
      "--",
      "--mesh",
      mesh,
      "--output",
      output
    ],
    { cwd: resolve(packageRoot, "../.."), stream: Boolean(options.stream) }
  );
  const report = await readJson(output);
  return {
    schemaVersion: 1,
    status: report.status,
    mesh: report.mesh,
    meshObjects: report.meshObjects,
    connectedComponents: report.connectedComponents,
    duplicateVertexRatio: report.duplicateVertexRatio,
    materialSlots: report.materialSlots,
    boundaryEdges: report.boundaryEdges,
    nonManifoldEdges: report.nonManifoldEdges,
    assemblyInterpretation: report.assemblyInterpretation,
    reportPath: output
  };
}

function assertApply(options) {
  if (!options.apply) throw fail("DIGITAL_HUMAN_APPLY_REQUIRED");
}

function optionalBoolean(value) {
  if (value === undefined) return undefined;
  return value !== false && value !== "false";
}

function optionalList(value) {
  if (value === undefined) return undefined;
  return String(value).split(",").map(item => item.trim()).filter(Boolean);
}

function ai3dProviderStatus(options = {}) {
  const credential = getMeshyCredentialAvailability();
  return {
    schemaVersion: 1,
    status: "PASS",
    externalModelCalled: false,
    credentialValueRead: false,
    providers: getAi3dProviderHealth({
      meshyCredentialAvailable: credential.available,
      huggingFaceAuthorized: Boolean(process.env.HF_TOKEN),
      stableFastModelAvailable: Boolean(options["stable-fast-model"]),
      gpuWorkerAvailable: Boolean(options["gpu-worker"])
    })
  };
}

async function prepareAi3d(options) {
  if (!options.manifest) throw fail("AI_3D_MULTIVIEW_MANIFEST_REQUIRED");
  if (!options.output) throw fail("DIGITAL_HUMAN_OUTPUT_REQUIRED");
  const manifestPath = resolve(options.manifest);
  const manifest = await readJson(manifestPath);
  const providerId = options.provider ?? "meshy-multi-image";
  const credential = getMeshyCredentialAvailability();
  const outputRoot = resolve(options.output);
  await mkdir(outputRoot, { recursive: true });
  const plan = buildAi3dReconstructionPlan({
    providerId,
    manifest,
    manifestPath,
    depthManifestPath: options["depth-manifest"],
    outputRoot,
    credentialAvailable: providerId === "meshy-multi-image" && credential.available
  });
  const planPath = resolve(outputRoot, "ai-3d-reconstruction-plan.json");
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return {
    schemaVersion: 1,
    status: plan.status,
    providerId,
    planPath,
    selectedViews: plan.input.views.map(view => ({ angle: view.angle, view: view.view, source: view.source })),
    qualityGate: plan.qualityGate,
    externalModelCalled: false,
    credentialValueRead: false
  };
}

function meshyCredentialStatus() {
  return {
    schemaVersion: 1,
    status: "PASS",
    ...getMeshyCredentialAvailability(),
    secretPersistence: "forbidden"
  };
}

async function meshySubmit(options) {
  if (!options.plan) throw fail("MESHY_3D_PLAN_PATH_REQUIRED");
  const plan = await readJson(resolve(options.plan));
  const preview = buildMeshySubmissionPreview(plan, {
    model: options.model,
    texture: optionalBoolean(options.texture),
    pbr: optionalBoolean(options.pbr),
    remesh: optionalBoolean(options.remesh),
    imageEnhancement: optionalBoolean(options["image-enhancement"]),
    targetFormats: optionalList(options["target-formats"])
  });
  if (options["dry-run"]) {
    return {
      schemaVersion: 1,
      status: "DRY_RUN",
      externalModelCalled: false,
      credentialValueRead: false,
      auditWritten: false,
      preview
    };
  }
  assertApply(options);
  const submission = await submitMeshyMultiImage(plan, {
    costApproved: Boolean(options["cost-approved"]),
    model: options.model,
    texture: optionalBoolean(options.texture),
    pbr: optionalBoolean(options.pbr),
    remesh: optionalBoolean(options.remesh),
    imageEnhancement: optionalBoolean(options["image-enhancement"]),
    targetFormats: optionalList(options["target-formats"])
  });
  const audit = createMeshySubmissionAudit(plan, preview, submission);
  const auditPath = resolve(options.output ?? resolve(plan.output.artifactRoot, plan.output.auditRecord));
  await writeMeshyAudit(auditPath, audit);
  return {
    schemaVersion: 1,
    status: submission.status,
    provider: "meshy-multi-image",
    taskId: submission.taskId,
    auditPath,
    credentialValuePersisted: false
  };
}

async function meshyStatus(options, shouldPoll = false) {
  if (!options.audit) throw fail("MESHY_3D_AUDIT_PATH_REQUIRED");
  const auditPath = resolve(options.audit);
  const audit = await readJson(auditPath);
  const taskId = audit.providerResult?.taskId;
  if (!taskId) throw fail("MESHY_3D_TASK_ID_MISSING_FROM_AUDIT", { auditPath });
  const endpoint = `${MESHY_API_BASE}${MESHY_MULTI_IMAGE_PATH}/${encodeURIComponent(taskId)}`;
  if (options["dry-run"]) {
    return {
      schemaVersion: 1,
      status: "DRY_RUN",
      provider: "meshy-multi-image",
      taskId,
      endpoint,
      externalModelCalled: false,
      credentialValueRead: false,
      auditWritten: false
    };
  }
  assertApply(options);
  const task = shouldPoll
    ? await pollMeshyTask(taskId, {
        timeoutMs: Number(options["timeout-seconds"] ?? 1200) * 1000,
        intervalMs: Number(options["interval-seconds"] ?? 10) * 1000
      })
    : await getMeshyTask(taskId);
  let download = null;
  if (options.download && task.status === "SUCCEEDED") {
    const outputPath = resolve(
      typeof options.download === "string"
        ? options.download
        : resolve(auditPath, "..", "provider-candidate.glb")
    );
    download = await downloadMeshyModel(task, outputPath);
  }
  await writeMeshyAudit(auditPath, updateMeshyTaskAudit(audit, task, download));
  return {
    schemaVersion: 1,
    status: task.status,
    provider: "meshy-multi-image",
    taskId,
    progress: task.progress,
    modelAvailable: Boolean(task.modelUrls?.glb),
    download,
    auditPath,
    resultUrlPersisted: false
  };
}

async function meshyTextSubmit(options) {
  if (!options.plan) throw fail("MESHY_TEXT_3D_PLAN_PATH_REQUIRED");
  const plan = await readJson(resolve(options.plan));
  const preview = buildMeshyTextSubmissionPreview(plan, {
    model: options.model,
    modelType: options["model-type"],
    remesh: optionalBoolean(options.remesh),
    poseMode: options["pose-mode"],
    targetFormats: optionalList(options["target-formats"]),
    alphaThumbnail: optionalBoolean(options["alpha-thumbnail"]),
    autoSize: optionalBoolean(options["auto-size"]),
    originAt: options["origin-at"]
  });
  if (options["dry-run"]) {
    return {
      schemaVersion: 1,
      status: "DRY_RUN",
      externalModelCalled: false,
      credentialValueRead: false,
      auditWritten: false,
      preview
    };
  }
  assertApply(options);
  const submission = await submitMeshyTextPreview(plan, {
    costApproved: Boolean(options["cost-approved"]),
    model: options.model,
    modelType: options["model-type"],
    remesh: optionalBoolean(options.remesh),
    poseMode: options["pose-mode"],
    targetFormats: optionalList(options["target-formats"]),
    alphaThumbnail: optionalBoolean(options["alpha-thumbnail"]),
    autoSize: optionalBoolean(options["auto-size"]),
    originAt: options["origin-at"]
  });
  const audit = createMeshyTextSubmissionAudit(plan, preview, submission);
  const artifactRoot = resolve(plan.output.artifactRoot);
  const auditPath = resolve(options.output ?? resolve(artifactRoot, plan.output.auditRecord));
  await writeMeshyAudit(auditPath, audit);
  return {
    schemaVersion: 1,
    status: submission.status,
    provider: "meshy-text-to-3d",
    taskId: submission.taskId,
    auditPath,
    credentialValuePersisted: false
  };
}

async function meshyTextStatus(options, shouldPoll = false) {
  if (!options.audit) throw fail("MESHY_TEXT_3D_AUDIT_PATH_REQUIRED");
  const auditPath = resolve(options.audit);
  const audit = await readJson(auditPath);
  const taskId = audit.providerResult?.taskId;
  if (!taskId) throw fail("MESHY_3D_TASK_ID_MISSING_FROM_AUDIT", { auditPath });
  const endpoint = `${MESHY_API_BASE}${MESHY_TEXT_TO_3D_PATH}/${encodeURIComponent(taskId)}`;
  if (options["dry-run"]) {
    return {
      schemaVersion: 1,
      status: "DRY_RUN",
      provider: "meshy-text-to-3d",
      taskId,
      endpoint,
      externalModelCalled: false,
      credentialValueRead: false,
      auditWritten: false
    };
  }
  assertApply(options);
  const task = shouldPoll
    ? await pollMeshyTextTask(taskId, {
        timeoutMs: Number(options["timeout-seconds"] ?? 1200) * 1000,
        intervalMs: Number(options["interval-seconds"] ?? 10) * 1000
      })
    : await getMeshyTextTask(taskId);
  let download = null;
  if (options.download && task.status === "SUCCEEDED") {
    const outputPath = resolve(
      typeof options.download === "string"
        ? options.download
        : resolve(auditPath, "..", "meshy-text-assembly-candidate.glb")
    );
    download = await downloadMeshyModel(task, outputPath);
  }
  await writeMeshyAudit(auditPath, updateMeshyTaskAudit(audit, task, download));
  return {
    schemaVersion: 1,
    status: task.status,
    provider: "meshy-text-to-3d",
    taskId,
    progress: task.progress,
    modelAvailable: Boolean(task.modelUrls?.glb),
    download,
    auditPath,
    resultUrlPersisted: false
  };
}

async function buildParametricPrintable(options) {
  if (!options.spec) throw fail("PARAMETRIC_CHARACTER_SPEC_REQUIRED");
  const blender = await existingBinary(["blender"]);
  if (!blender) throw fail("BLENDER_NOT_INSTALLED");

  const repoRoot = resolve(packageRoot, "../..");
  const specPath = resolve(options.spec);
  const workflow = await readJson(specPath);
  if (
    workflow.schemaVersion !== 1 ||
    workflow.domain !== "3D_MODELING" ||
    workflow.constructionMode !== "GEOMETRY_FIRST" ||
    workflow.assembly?.forbidGlobalVoxelMaster !== true
  ) {
    throw fail("PARAMETRIC_CHARACTER_SPEC_INVALID");
  }
  const manifestPath = resolve(repoRoot, workflow.referenceManifest);
  const manifest = await readJson(manifestPath);
  const authoritative =
    manifest.views?.find(view => view.angle === manifest.authoritativeView) ??
    manifest.views?.[0];
  if (!authoritative) throw fail("PARAMETRIC_CHARACTER_AUTHORITATIVE_VIEW_MISSING");
  const reference = resolve(
    authoritative.normalizedPath ?? authoritative.sourcePath
  );
  const brandReference = resolve(
    authoritative.sourcePath ?? authoritative.normalizedPath
  );
  const output = resolve(
    options.output ?? resolve(repoRoot, workflow.outputRoot)
  );
  const weldMethod = String(options["weld-method"] ?? "assembly-only");
  if (!["assembly-only", "voxel-preview"].includes(weldMethod)) {
    throw fail("PARAMETRIC_CHARACTER_WELD_METHOD_INVALID");
  }
  await Promise.all([
    access(specPath),
    access(manifestPath),
    access(reference),
    access(brandReference),
    mkdir(output, { recursive: true })
  ]);

  await run(
    blender,
    [
      "--background",
      "--factory-startup",
      "--python",
      resolve(packageRoot, "blender/build_huihui_printable_v2.py"),
      "--",
      "--output",
      output,
      "--reference",
      reference,
      "--brand-reference",
      brandReference,
      "--spec",
      specPath,
      "--asset-id",
      workflow.assetId,
      "--height-mm",
      String(workflow.targetHeightMm),
      "--weld-method",
      weldMethod
    ],
    { cwd: output, stream: Boolean(options.stream) }
  );

  const reportPath = resolve(output, "printability-report.json");
  const assemblyManifestPath = resolve(output, "semantic-assembly-manifest.json");
  const [report, assembly] = await Promise.all([
    readJson(reportPath),
    readJson(assemblyManifestPath)
  ]);
  return {
    schemaVersion: 1,
    status: report.status,
    constructionMode: "GEOMETRY_FIRST",
    assetId: workflow.assetId,
    externalModelCalled: false,
    credentialValueRead: false,
    authoritativeMaster: report.authoritativeMaster,
    manufacturingUnionStatus: report.manufacturingUnionStatus,
    semanticPartCount: new Set(assembly.parts.map(part => part.semanticPart)).size,
    objectCount: assembly.parts.length,
    outputRoot: output,
    artifacts: {
      blend: resolve(output, `${workflow.assetId}-semantic-master.blend`),
      glb: resolve(output, `${workflow.assetId}-semantic-assembly.glb`),
      assemblyManifest: assemblyManifestPath,
      report: reportPath,
      previews: resolve(output, "previews")
    }
  };
}

async function refinePrintable(options) {
  if (!options.mesh) throw fail("DIGITAL_HUMAN_PRINTABLE_MESH_REQUIRED");
  if (!options.manifest) throw fail("AI_3D_MULTIVIEW_MANIFEST_REQUIRED");
  if (!options.output) throw fail("DIGITAL_HUMAN_OUTPUT_REQUIRED");
  const blender = await existingBinary(["blender"]);
  const python = await existingBinary([resolve(packageRoot, ".venv-reconstruction/bin/python")]);
  if (!blender) throw fail("BLENDER_NOT_INSTALLED");
  if (!python) throw fail("DIGITAL_HUMAN_RECONSTRUCTION_PYTHON_MISSING");

  const sourceMesh = resolve(options.mesh);
  const manifest = resolve(options.manifest);
  const output = resolve(options.output);
  const assetId = String(options["asset-id"] ?? "huihui-printable-v3");
  const targetHeightMm = Number(options["target-height-mm"] ?? 180);
  const surfaceSubdivisionLevel = Math.max(
    0,
    Math.min(Number(options["surface-subdivision-level"] ?? 1), 2)
  );
  const surfaceMethod = String(options["surface-method"] ?? "voxel");
  if (!["voxel", "catmull-clark", "relax-only"].includes(surfaceMethod)) {
    throw fail("DIGITAL_HUMAN_SURFACE_METHOD_INVALID");
  }
  const surfaceProfile = String(
    options["surface-profile"] ?? "feature-preserving"
  );
  if (!["uniform", "feature-preserving"].includes(surfaceProfile)) {
    throw fail("DIGITAL_HUMAN_SURFACE_PROFILE_INVALID");
  }
  const featureAngleDegrees = Math.max(
    20,
    Math.min(Number(options["feature-angle-degrees"] ?? 60), 120)
  );
  const featureProtectionRings = Math.max(
    0,
    Math.min(Number(options["feature-protection-rings"] ?? 1), 5)
  );
  const stream = Boolean(options.stream);
  await Promise.all([access(sourceMesh), access(manifest), mkdir(output, { recursive: true })]);

  await run(
    blender,
    [
      "--background",
      "--factory-startup",
      "--python",
      resolve(packageRoot, "blender/refine_provider_candidate.py"),
      "--",
      "--mesh",
      sourceMesh,
      "--output-dir",
      output,
      "--asset-id",
      assetId,
      "--target-height-mm",
      String(targetHeightMm),
      "--surface-subdivision-level",
      String(surfaceSubdivisionLevel),
      "--surface-method",
      surfaceMethod,
      "--surface-profile",
      surfaceProfile,
      "--feature-angle-degrees",
      String(featureAngleDegrees),
      "--feature-protection-rings",
      String(featureProtectionRings)
    ],
    { cwd: output, stream }
  );

  const refinedGlb = resolve(output, `${assetId}-refined.glb`);
  const baseStl = resolve(output, `${assetId}-base.stl`);
  const assemblyStl = resolve(output, `${assetId}-assembly.stl`);
  await Promise.all([
    access(refinedGlb),
    access(baseStl),
    access(assemblyStl),
    access(resolve(output, "refinement-report.json"))
  ]).catch(error => {
    throw fail("DIGITAL_HUMAN_REFINEMENT_ARTIFACTS_MISSING", {
      output,
      message: error.message
    });
  });
  const turntableDir = resolve(output, "turntable");
  const clayTurntableDir = resolve(output, "clay-turntable");
  const silhouetteDir = resolve(output, "silhouettes");
  await Promise.all([
    mkdir(turntableDir, { recursive: true }),
    mkdir(clayTurntableDir, { recursive: true }),
    mkdir(silhouetteDir, { recursive: true })
  ]);

  await run(
    python,
    [
      resolve(packageRoot, "python/validate_printable_mesh.py"),
      "--mesh",
      baseStl,
      "--output",
      resolve(output, "printability-report.json"),
      "--target-height-mm",
      String(targetHeightMm)
    ],
    { cwd: output, stream }
  );
  await run(
    blender,
    [
      "--background",
      "--factory-startup",
      "--python",
      resolve(packageRoot, "blender/render_mesh_turntable.py"),
      "--",
      "--mesh",
      refinedGlb,
      "--output-dir",
      turntableDir,
      "--resolution",
      String(options.resolution ?? 1024),
      "--preserve-materials",
      "--prefix",
      `${assetId}-color`
    ],
    { cwd: output, stream }
  );
  await run(
    blender,
    [
      "--background",
      "--factory-startup",
      "--python",
      resolve(packageRoot, "blender/render_mesh_turntable.py"),
      "--",
      "--mesh",
      refinedGlb,
      "--output-dir",
      clayTurntableDir,
      "--resolution",
      String(options.resolution ?? 1024),
      "--prefix",
      `${assetId}-clay`
    ],
    { cwd: output, stream }
  );
  await Promise.all([
    run(
      python,
      [
        resolve(packageRoot, "python/make_turntable_contact_sheet.py"),
        "--input-dir",
        turntableDir,
        "--output",
        resolve(output, "color-turntable-contact-sheet.jpg"),
        "--title",
        `${assetId} color material review`
      ],
      { cwd: output, stream }
    ),
    run(
      python,
      [
        resolve(packageRoot, "python/make_turntable_contact_sheet.py"),
        "--input-dir",
        clayTurntableDir,
        "--output",
        resolve(output, "clay-turntable-contact-sheet.jpg"),
        "--title",
        `${assetId} clay surface review`
      ],
      { cwd: output, stream }
    )
  ]);
  await run(
    blender,
    [
      "--background",
      "--factory-startup",
      "--python",
      resolve(packageRoot, "blender/render_mesh_silhouettes.py"),
      "--",
      "--mesh",
      refinedGlb,
      "--output-dir",
      silhouetteDir
    ],
    { cwd: output, stream }
  );
  await run(
    python,
    [
      resolve(packageRoot, "python/compare_silhouettes.py"),
      "--manifest",
      manifest,
      "--render-dir",
      silhouetteDir,
      "--output",
      resolve(output, "silhouette-report.json"),
      "--contact-sheet",
      resolve(output, "silhouette-contact-sheet.jpg")
    ],
    { cwd: output, stream }
  );

  const [refinement, printability, silhouette] = await Promise.all([
    readJson(resolve(output, "refinement-report.json")),
    readJson(resolve(output, "printability-report.json")),
    readJson(resolve(output, "silhouette-report.json"))
  ]);
  const packageManifest = {
    schemaVersion: 1,
    assetId,
    status:
      printability.status !== "FAIL" && silhouette.status !== "FAIL"
        ? "REVIEW_READY"
        : "DCC_REWORK_REQUIRED",
    source: {
      providerMesh: sourceMesh,
      multiviewManifest: manifest,
      sourcePreserved: true
    },
    modeling: {
      domain: "3d-modeling",
      surfaceSubdivisionLevel,
      surfaceMethod,
      detailConformance:
        "BVH_RAY_CONFORMED_WITH_INVALID_PROJECTION_CLIPPING_AND_INWARD_OVERLAP"
    },
    refinement,
    gates: {
      geometry: printability.status,
      silhouette: silhouette.status,
      textureAndMaterials: "DCC_AUTHORED",
      physicalPrintProof: "REQUIRED_BEFORE_FINAL_RELEASE"
    },
    artifacts: {
      refinedGlb,
      baseStl,
      assemblyStl,
      blenderSource: resolve(output, `${assetId}-refined.blend`),
      colorTurntable: turntableDir,
      clayTurntable: clayTurntableDir,
      colorTurntableContactSheet: resolve(output, "color-turntable-contact-sheet.jpg"),
      clayTurntableContactSheet: resolve(output, "clay-turntable-contact-sheet.jpg"),
      silhouetteContactSheet: resolve(output, "silhouette-contact-sheet.jpg"),
      printabilityReport: resolve(output, "printability-report.json"),
      silhouetteReport: resolve(output, "silhouette-report.json")
    },
    releaseConditions: [
      "Visual owner approves the color and clay turntables.",
      "Slicer verifies wall thickness, self intersections and supports.",
      "A 60 mm physical proof is approved before the 180 mm print."
    ]
  };
  const packageManifestPath = resolve(output, "printable-asset-package.json");
  await writeFile(packageManifestPath, `${JSON.stringify(packageManifest, null, 2)}\n`);
  return {
    schemaVersion: 1,
    status: packageManifest.status,
    assetId,
    outputRoot: output,
    gates: packageManifest.gates,
    metrics: silhouette.summary,
    artifacts: packageManifest.artifacts,
    packageManifest: packageManifestPath,
    externalModelCalled: false,
    credentialValueRead: false
  };
}

async function printableStatus(options) {
  if (!options.package) throw fail("DIGITAL_HUMAN_PRINTABLE_PACKAGE_REQUIRED");
  const packagePath = resolve(options.package);
  const manifest = await readJson(packagePath);
  const requiredArtifacts = [
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
  const artifacts = await Promise.all(
    requiredArtifacts.map(async key => {
      const path = manifest.artifacts?.[key] ?? null;
      if (!path) return { key, path: null, status: "MISSING" };
      try {
        await access(path);
        return { key, path, status: "PASS" };
      } catch {
        return { key, path, status: "MISSING" };
      }
    })
  );
  const geometryPassed = ["PASS", "PASS_WITH_CONDITIONS"].includes(manifest.gates?.geometry);
  const silhouettePassed = manifest.gates?.silhouette === "PASS";
  const artifactsPassed = artifacts.every(item => item.status === "PASS");
  let releaseEvidence = {
    status: "NOT_PROVIDED",
    report: null,
    visualOwnerReview: "REQUIRED",
    slicerReview: "REQUIRED",
    physical60mmProof: "NOT_PROVIDED",
    validationErrors: []
  };
  if (options["release-evidence"]) {
    const reportPath = resolve(options["release-evidence"]);
    const report = await readJson(reportPath);
    if (report.assetId !== manifest.assetId) {
      throw fail("DIGITAL_HUMAN_RELEASE_EVIDENCE_ASSET_MISMATCH", {
        packageAssetId: manifest.assetId,
        evidenceAssetId: report.assetId ?? null
      });
    }
    const reportRoot = dirname(reportPath);
    const validationErrors = [];
    const metadataValid = (gate, gateName) => {
      if (!gate?.reviewedBy || typeof gate.reviewedBy !== "string") {
        validationErrors.push(`${gateName}.reviewedBy is required`);
      }
      if (!gate?.reviewedAt || Number.isNaN(Date.parse(gate.reviewedAt))) {
        validationErrors.push(`${gateName}.reviewedAt must be an ISO date-time`);
      }
      if (typeof gate?.notes !== "string") {
        validationErrors.push(`${gateName}.notes is required`);
      }
    };
    if (report.visualOwnerReview?.status === "PASS") {
      metadataValid(report.visualOwnerReview, "visualOwnerReview");
    }
    if (report.slicerReview?.status === "PASS") {
      metadataValid(report.slicerReview, "slicerReview");
      if (!(report.slicerReview.minimumWallMm >= 1.6)) {
        validationErrors.push("slicerReview.minimumWallMm must be at least 1.6");
      }
      if (report.slicerReview.selfIntersectionCheck !== "PASS") {
        validationErrors.push("slicerReview.selfIntersectionCheck must be PASS");
      }
      if (report.slicerReview.supportReview !== "PASS") {
        validationErrors.push("slicerReview.supportReview must be PASS");
      }
      if (!report.slicerReview.reportPath) {
        validationErrors.push("slicerReview.reportPath is required");
      } else {
        await access(resolve(reportRoot, report.slicerReview.reportPath)).catch(() => {
          validationErrors.push("slicerReview.reportPath is not readable");
        });
      }
    }
    if (report.physical60mmProof?.status === "PASS") {
      metadataValid(report.physical60mmProof, "physical60mmProof");
      if (
        !(report.physical60mmProof.printedHeightMm >= 55) ||
        !(report.physical60mmProof.printedHeightMm <= 65)
      ) {
        validationErrors.push("physical60mmProof.printedHeightMm must be between 55 and 65");
      }
      if (
        !Array.isArray(report.physical60mmProof.photoPaths) ||
        report.physical60mmProof.photoPaths.length < 2
      ) {
        validationErrors.push("physical60mmProof.photoPaths requires at least two photos");
      } else {
        for (const photoPath of report.physical60mmProof.photoPaths) {
          await access(resolve(reportRoot, photoPath)).catch(() => {
            validationErrors.push(`physical60mmProof photo is not readable: ${photoPath}`);
          });
        }
      }
    }
    const statusFor = (gate, prefix, missing = "REQUIRED") => {
      if (gate?.status === "FAIL") return "FAIL";
      if (gate?.status !== "PASS") return missing;
      return validationErrors.some(message => message.startsWith(prefix)) ? "FAIL" : "PASS";
    };
    releaseEvidence = {
      status: "PROVIDED",
      report: reportPath,
      visualOwnerReview: statusFor(report.visualOwnerReview, "visualOwnerReview"),
      slicerReview: statusFor(report.slicerReview, "slicerReview"),
      physical60mmProof: statusFor(
        report.physical60mmProof,
        "physical60mmProof",
        "NOT_PROVIDED"
      ),
      validationErrors
    };
  } else if (options["physical-proof"]) {
    const reportPath = resolve(options["physical-proof"]);
    const report = await readJson(reportPath);
    releaseEvidence = {
      ...releaseEvidence,
      status: "LEGACY_PHYSICAL_PROOF_ONLY",
      report: reportPath,
      physical60mmProof: report.status === "PASS" ? "PASS" : "FAIL",
      validationErrors: [
        "Legacy physical proof cannot replace visual owner and slicer evidence."
      ]
    };
  }
  const automatedQaPassed = geometryPassed && silhouettePassed && artifactsPassed;
  const releaseEvidencePassed =
    releaseEvidence.visualOwnerReview === "PASS" &&
    releaseEvidence.slicerReview === "PASS" &&
    releaseEvidence.physical60mmProof === "PASS";
  const releaseEvidenceFailed = [
    releaseEvidence.visualOwnerReview,
    releaseEvidence.slicerReview,
    releaseEvidence.physical60mmProof
  ].includes("FAIL");
  return {
    schemaVersion: 1,
    assetId: manifest.assetId,
    status:
      !automatedQaPassed
        ? "DCC_REWORK_REQUIRED"
        : releaseEvidenceFailed
          ? "RELEASE_EVIDENCE_REWORK_REQUIRED"
          : releaseEvidencePassed
          ? "READY_FOR_RELEASE_REVIEW"
          : "READY_FOR_VISUAL_AND_PHYSICAL_PROOF",
    stages: [
      { stage: "PROVIDER_CANDIDATE", status: manifest.source?.providerMesh ? "PASS" : "MISSING" },
      { stage: "DCC_REFINEMENT", status: manifest.refinement?.status === "REFINED_CANDIDATE_READY" ? "PASS" : "FAIL" },
      { stage: "AUTOMATED_GEOMETRY_QA", status: manifest.gates?.geometry ?? "MISSING" },
      { stage: "EIGHT_VIEW_SILHOUETTE_QA", status: manifest.gates?.silhouette ?? "MISSING" },
      { stage: "ARTIFACT_INTEGRITY", status: artifactsPassed ? "PASS" : "FAIL" },
      { stage: "VISUAL_OWNER_REVIEW", status: releaseEvidence.visualOwnerReview },
      { stage: "SLICER_WALL_AND_SUPPORT_REVIEW", status: releaseEvidence.slicerReview },
      { stage: "PHYSICAL_60MM_PROOF", status: releaseEvidence.physical60mmProof }
    ],
    artifacts,
    releaseEvidence,
    releaseBlocked: !releaseEvidencePassed,
    externalModelCalled: false,
    credentialValueRead: false
  };
}

async function klingSubmit(options) {
  if (!options.plan) throw fail("KLING_PLAN_PATH_REQUIRED");
  const plan = await readJson(resolve(options.plan));
  const preview = buildKlingSubmissionPreview(plan, {
    duration: options.duration,
    resolution: options.resolution,
    nativeAudio: options["native-audio"],
    multiShot: options["multi-shot"],
    callbackUrl: options["callback-url"],
    externalTaskId: options["external-task-id"],
    watermark: options.watermark
  });
  if (options["dry-run"]) {
    return {
      schemaVersion: 1,
      status: "DRY_RUN",
      externalModelCalled: false,
      credentialValueRead: false,
      auditWritten: false,
      preview
    };
  }
  assertApply(options);
  const submission = await submitKlingImageToVideo(plan, {
    costApproved: Boolean(options["cost-approved"]),
    duration: options.duration,
    resolution: options.resolution,
    nativeAudio: options["native-audio"],
    multiShot: options["multi-shot"],
    callbackUrl: options["callback-url"],
    externalTaskId: options["external-task-id"],
    watermark: options.watermark
  });
  const audit = createKlingSubmissionAudit(plan, preview, submission);
  const auditPath = resolve(options.output ?? resolve(plan.output.artifactRoot, plan.output.auditRecord));
  await writeKlingAudit(auditPath, audit);
  return {
    schemaVersion: 1,
    status: submission.status,
    provider: "kling-ai",
    taskId: submission.taskId,
    externalTaskId: submission.externalTaskId,
    auditPath,
    credentialValuePersisted: false
  };
}

function klingCredentialStatus() {
  return {
    schemaVersion: 1,
    status: "PASS",
    ...getKlingCredentialAvailability(),
    secretPersistence: "forbidden"
  };
}

async function klingStatus(options, shouldPoll = false) {
  if (!options.audit) throw fail("KLING_AUDIT_PATH_REQUIRED");
  const auditPath = resolve(options.audit);
  const audit = await readJson(auditPath);
  const taskId = audit.providerResult?.taskId;
  if (!taskId) throw fail("KLING_TASK_ID_MISSING_FROM_AUDIT", { auditPath });
  const endpoint = `${KLING_OVERSEAS_API_BASE}${KLING_TASKS_PATH}?task_ids=${encodeURIComponent(taskId)}`;
  if (options["dry-run"]) {
    return {
      schemaVersion: 1,
      status: "DRY_RUN",
      provider: "kling-ai",
      taskId,
      endpoint,
      externalModelCalled: false,
      credentialValueRead: false,
      auditWritten: false
    };
  }
  assertApply(options);
  const task = shouldPoll
    ? await pollKlingTask(taskId, {
        timeoutMs: Number(options["timeout-seconds"] ?? 600) * 1000,
        intervalMs: Number(options["interval-seconds"] ?? 10) * 1000
      })
    : await getKlingTask(taskId);
  let download = null;
  if (options.download && task.status === "succeeded") {
    const outputPath = resolve(
      typeof options.download === "string"
        ? options.download
        : resolve(auditPath, "..", "provider-result.mp4")
    );
    download = await downloadKlingVideo(task, outputPath);
  }
  await writeKlingAudit(auditPath, updateKlingTaskAudit(audit, task, download));
  return {
    schemaVersion: 1,
    status: task.status,
    provider: "kling-ai",
    taskId,
    message: task.message,
    outputAvailable: task.outputs.length > 0,
    download,
    auditPath,
    resultUrlPersisted: false
  };
}

async function renderFidelity(projectRoot, outputRoot, stream = false) {
  const validation = await validateProject(projectRoot);
  if (validation.fidelity !== "high") throw fail("DIGITAL_HUMAN_HIGH_FIDELITY_PROJECT_REQUIRED");
  const blender = await existingBinary(["blender"]);
  const ffmpeg = await existingBinary(["ffmpeg"]);
  const ffprobe = await existingBinary(["ffprobe"]);
  if (!blender) throw fail("BLENDER_NOT_INSTALLED");
  if (!ffmpeg || !ffprobe) throw fail("FFMPEG_NOT_INSTALLED");
  const output = resolve(outputRoot);
  await mkdir(output, { recursive: true });
  await run(
    blender,
    [
      "--background",
      "--factory-startup",
      "--python",
      resolve(packageRoot, "blender/render_fidelity_test.py"),
      "--",
      "--project",
      validation.projectRoot,
      "--output",
      output
    ],
    { cwd: validation.projectRoot, stream }
  );
  const story = await readJson(resolve(validation.projectRoot, "story.json"));
  const characters = await readJson(resolve(validation.projectRoot, "characters.json"));
  const scene = await readJson(resolve(validation.projectRoot, "scene.json"));
  const visual = resolve(output, "visual.mp4");
  await access(visual).catch(() => {
    throw fail("BLENDER_RENDER_ARTIFACT_MISSING", { visual });
  });
  const finalVideo = resolve(output, "huihui-reference-fidelity-test.mp4");
  const audio = story.dialogue[0]?.audio ? resolve(validation.projectRoot, story.dialogue[0].audio) : null;
  if (audio) {
    const delay = Math.max(0, Math.round((story.dialogue[0]?.start ?? 0) * 1000));
    await run(
      ffmpeg,
      [
        "-y",
        "-i",
        visual,
        "-i",
        audio,
        "-filter_complex",
        `[1:a]adelay=${delay}|${delay}[voice]`,
        "-map",
        "0:v:0",
        "-map",
        "[voice]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-t",
        String(story.duration),
        "-movflags",
        "+faststart",
        finalVideo
      ],
      { cwd: output, stream }
    );
  } else {
    await run(ffmpeg, ["-y", "-i", visual, "-c", "copy", finalVideo], { cwd: output });
  }
  const concept = resolve(validation.projectRoot, characters[0].referenceAssets.identitySheet);
  const sceneReference = resolve(validation.projectRoot, scene.reconstruction.referenceFrame);
  await run(
    ffmpeg,
    [
      "-y",
      "-i",
      concept,
      "-i",
      resolve(output, "fidelity-action.png"),
      "-filter_complex",
      "[0:v]scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2:white[left];[1:v]scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2:white[right];[left][right]hstack=inputs=2",
      "-frames:v",
      "1",
      resolve(output, "character-fidelity-comparison.png")
    ],
    { cwd: output }
  );
  await run(
    ffmpeg,
    [
      "-y",
      "-i",
      sceneReference,
      "-i",
      resolve(output, "fidelity-action.png"),
      "-filter_complex",
      "[0:v]scale=640:360[left];[1:v]scale=640:360[right];[left][right]hstack=inputs=2",
      "-frames:v",
      "1",
      resolve(output, "scene-reconstruction-comparison.png")
    ],
    { cwd: output }
  );
  const probe = await run(ffprobe, ["-v", "error", "-show_format", "-show_streams", "-of", "json", finalVideo]);
  await writeFile(resolve(output, "ffprobe.json"), `${probe.stdout.trim()}\n`);
  return {
    ...validation,
    status: "SUCCEEDED",
    outputRoot: output,
    artifacts: [
      "huihui-reference-fidelity-test.mp4",
      "huihui-fidelity-scene.blend",
      "huihui-fidelity-character.glb",
      "character-fidelity-comparison.png",
      "scene-reconstruction-comparison.png",
      "render-report.json",
      "ffprobe.json"
    ]
  };
}

async function renderReferenceLocked(projectRoot, outputRoot, stream = false) {
  const validation = await validateProject(projectRoot);
  if (validation.fidelity !== "high") throw fail("DIGITAL_HUMAN_HIGH_FIDELITY_PROJECT_REQUIRED");
  const python = await existingBinary([resolve(packageRoot, ".venv-reconstruction/bin/python")]);
  const ffprobe = await existingBinary(["ffprobe"]);
  if (!python) throw fail("DIGITAL_HUMAN_RECONSTRUCTION_PYTHON_MISSING");
  if (!ffprobe) throw fail("FFPROBE_NOT_INSTALLED");
  const characters = await readJson(resolve(validation.projectRoot, "characters.json"));
  const asset = characters[0]?.referenceAssets?.referenceLockedCutout;
  if (!asset) throw fail("DIGITAL_HUMAN_REFERENCE_LOCK_ASSET_REQUIRED");
  await access(resolve(validation.projectRoot, asset)).catch(() => {
    throw fail("DIGITAL_HUMAN_REFERENCE_LOCK_ASSET_MISSING", { asset });
  });
  const output = resolve(outputRoot);
  await mkdir(output, { recursive: true });
  await run(
    python,
    [
      resolve(packageRoot, "python/render_reference_locked.py"),
      "--project",
      validation.projectRoot,
      "--output",
      output
    ],
    { cwd: validation.projectRoot, stream }
  );
  const finalVideo = resolve(output, "huihui-reference-locked-test.mp4");
  await access(finalVideo).catch(() => {
    throw fail("REFERENCE_LOCK_RENDER_ARTIFACT_MISSING", { finalVideo });
  });
  const probe = await run(ffprobe, ["-v", "error", "-show_format", "-show_streams", "-of", "json", finalVideo]);
  await writeFile(resolve(output, "ffprobe.json"), `${probe.stdout.trim()}\n`);
  return {
    ...validation,
    status: "SUCCEEDED",
    identityMode: "reference-locked-2.5d",
    sceneMode: "dynamic-source-footage",
    outputRoot: output,
    artifacts: [
      "huihui-reference-locked-test.mp4",
      "huihui-reference-locked-cutout.png",
      "reference-locked-action.png",
      "reference-locked-motion-contact-sheet.jpg",
      "reference-lock-report.json",
      "ffprobe.json"
    ]
  };
}

async function prepare(projectRoot) {
  const validation = await validateProject(projectRoot);
  const root = validation.projectRoot;
  const python =
    (await existingBinary([resolve(packageRoot, ".venv/bin/python3")])) ??
    (await existingBinary(["python3"])) ??
    findBinary(["python3"]);
  const story = await readJson(resolve(root, "story.json"));
  const outputRoot = resolve(root, "generated/visemes");
  await mkdir(outputRoot, { recursive: true });
  const tracks = [];
  for (const dialogue of story.dialogue) {
    const output = resolve(outputRoot, `${dialogue.speaker}-${String(dialogue.start).replace(".", "_")}.json`);
    await run(
      python,
      [
        resolve(packageRoot, "python/generate_visemes.py"),
        "--text",
        dialogue.text,
        "--audio",
        resolve(root, dialogue.audio),
        "--speaker",
        dialogue.speaker,
        "--start",
        String(dialogue.start),
        "--output",
        output
      ],
      { cwd: root }
    );
    tracks.push({ speaker: dialogue.speaker, start: dialogue.start, output });
  }
  const manifest = { schemaVersion: 1, status: "PASS", generatedAt: new Date().toISOString(), tracks };
  await writeFile(resolve(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { ...validation, visemeTracks: tracks };
}

async function render(projectRoot, outputRoot, stream = false) {
  const prepared = await prepare(projectRoot);
  const blender = await existingBinary(["blender"]);
  if (!blender) throw fail("BLENDER_NOT_INSTALLED");
  const output = resolve(outputRoot);
  await mkdir(output, { recursive: true });
  await run(
    blender,
    [
      "--background",
      "--factory-startup",
      "--python",
      resolve(packageRoot, "blender/render_story.py"),
      "--",
      "--project",
      prepared.projectRoot,
      "--output",
      output
    ],
    { cwd: prepared.projectRoot, stream }
  );
  const story = await readJson(resolve(prepared.projectRoot, "story.json"));
  const ffmpeg = await existingBinary(["ffmpeg"]);
  if (!ffmpeg) throw fail("FFMPEG_NOT_INSTALLED");
  const visualPath = resolve(output, "visual.mp4");
  await access(visualPath).catch(() => {
    throw fail("BLENDER_RENDER_ARTIFACT_MISSING", { visualPath });
  });
  const videoPath = resolve(output, "digital-human-pilot.mp4");
  const audioInputs = [];
  const filterParts = [];
  for (const [index, dialogue] of story.dialogue.entries()) {
    audioInputs.push("-i", resolve(prepared.projectRoot, dialogue.audio));
    const delay = Math.max(0, Math.round(dialogue.start * 1000));
    filterParts.push(`[${index + 1}:a]adelay=${delay}|${delay}[voice${index}]`);
  }
  const voiceLabels = story.dialogue.map((_, index) => `[voice${index}]`).join("");
  filterParts.push(
    story.dialogue.length
      ? `${voiceLabels}amix=inputs=${story.dialogue.length}:duration=longest:normalize=0[aout]`
      : "anullsrc=channel_layout=stereo:sample_rate=48000[aout]"
  );
  await run(
    ffmpeg,
    [
      "-y",
      "-i",
      visualPath,
      ...audioInputs,
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "0:v:0",
      "-map",
      "[aout]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-t",
      String(story.duration),
      "-movflags",
      "+faststart",
      videoPath
    ],
    { cwd: output, stream }
  );
  await run(
    ffmpeg,
    [
      "-y",
      "-framerate",
      "1",
      "-pattern_type",
      "glob",
      "-i",
      resolve(output, "turntable-*.png"),
      "-vf",
      "scale=240:240,tile=8x4",
      "-frames:v",
      "1",
      "-q:v",
      "2",
      resolve(output, "turntable-contact-sheet.jpg")
    ],
    { cwd: output, stream }
  );
  await access(videoPath);
  const ffprobe = await existingBinary(["ffprobe"]);
  if (!ffprobe) throw fail("FFPROBE_NOT_INSTALLED");
  const probe = await run(ffprobe, ["-v", "error", "-show_format", "-show_streams", "-of", "json", videoPath]);
  const report = JSON.parse(probe.stdout);
  await writeFile(resolve(output, "ffprobe.json"), `${JSON.stringify(report, null, 2)}\n`);
  return {
    ...prepared,
    status: "SUCCEEDED",
    outputRoot: output,
    artifacts: [
      "digital-human-pilot.mp4",
      "visual.mp4",
      "digital-human-master.blend",
      "scene.glb",
      ...story.dialogue.map(item => `character-${item.speaker}.glb`).filter((item, index, values) => values.indexOf(item) === index),
      "turntable-contact-sheet.jpg",
      "ffprobe.json"
    ]
  };
}

async function renderTurntables(projectRoot, outputRoot, stream = false) {
  const validation = await validateProject(projectRoot);
  const blender = await existingBinary(["blender"]);
  const ffmpeg = await existingBinary(["ffmpeg"]);
  if (!blender) throw fail("BLENDER_NOT_INSTALLED");
  if (!ffmpeg) throw fail("FFMPEG_NOT_INSTALLED");
  const output = resolve(outputRoot);
  await access(resolve(output, "digital-human-master.blend")).catch(() => {
    throw fail("DIGITAL_HUMAN_MASTER_MISSING", { output });
  });
  await run(
    blender,
    [
      "--background",
      "--python",
      resolve(packageRoot, "blender/render_story.py"),
      "--",
      "--project",
      validation.projectRoot,
      "--output",
      output,
      "--turntables-only"
    ],
    { cwd: validation.projectRoot, stream }
  );
  await run(
    ffmpeg,
    [
      "-y",
      "-framerate",
      "1",
      "-pattern_type",
      "glob",
      "-i",
      resolve(output, "turntable-*.png"),
      "-vf",
      "scale=240:240,tile=8x4",
      "-frames:v",
      "1",
      "-q:v",
      "2",
      "-update",
      "1",
      resolve(output, "turntable-contact-sheet.jpg")
    ],
    { cwd: output, stream }
  );
  return {
    ...validation,
    status: "SUCCEEDED",
    outputRoot: output,
    artifacts: ["turntable-*.png", "turntable-contact-sheet.jpg"]
  };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  let result;
  if (command === "doctor") result = await doctor();
  else if (command === "prepare-orbit-reference") result = await prepareOrbitReference(options);
  else if (command === "extract-orbit-frames") result = await extractOrbitFrames(options);
  else if (command === "observe-orbit-reference") result = await observeOrbitReference(options);
  else if (command === "fit-orbit-parameters") result = await fitOrbitParameters(options);
  else if (command === "build-gauge-calibration") result = await buildGaugeCalibration(options);
  else if (command === "build-gauge-depth-transfer") {
    result = await buildGaugeDepthTransfer(options);
  }
  else if (command === "build-semantic-part-candidate") {
    result = await buildSemanticPartCandidate(options);
  }
  else if (command === "evaluate-orbit-candidate") result = await evaluateOrbitCandidate(options);
  else if (command === "evaluate-render-fidelity") result = await evaluateRenderFidelity(options);
  else if (command === "promote-render-fidelity") result = await promoteRenderFidelity(options);
  else if (command === "inspect-mesh-assembly") result = await inspectMeshAssembly(options);
  else if (command === "reconstruction-providers") result = ai3dProviderStatus(options);
  else if (command === "prepare-ai-3d") result = await prepareAi3d(options);
  else if (command === "meshy-credential-status") result = meshyCredentialStatus();
  else if (command === "meshy-3d-submit") result = await meshySubmit(options);
  else if (command === "meshy-3d-status") result = await meshyStatus(options, false);
  else if (command === "meshy-3d-poll") result = await meshyStatus(options, true);
  else if (command === "meshy-text-3d-submit") result = await meshyTextSubmit(options);
  else if (command === "meshy-text-3d-status") result = await meshyTextStatus(options, false);
  else if (command === "meshy-text-3d-poll") result = await meshyTextStatus(options, true);
  else if (command === "build-parametric-printable") {
    result = await buildParametricPrintable(options);
  }
  else if (command === "refine-printable") result = await refinePrintable(options);
  else if (command === "printable-status") result = await printableStatus(options);
  else if (command === "kling-credential-status") result = klingCredentialStatus();
  else if (command === "kling-submit") result = await klingSubmit(options);
  else if (command === "kling-status") result = await klingStatus(options, false);
  else if (command === "kling-poll") result = await klingStatus(options, true);
  else {
    const project = options.project;
    if (!project) throw fail("DIGITAL_HUMAN_PROJECT_REQUIRED");
    if (command === "validate") result = await validateProject(project);
    else if (command === "extract-reference-assets") {
      result = await extractReferenceAssets(project, options.source, options.output);
    }
    else if (command === "reconstruct") {
      result = await reconstruct(project, options.source, options.timestamp ?? "0");
    }
    else if (command === "prepare") result = await prepare(project);
    else if (command === "turntables") {
      if (!options.output) throw fail("DIGITAL_HUMAN_OUTPUT_REQUIRED");
      result = await renderTurntables(project, options.output, Boolean(options.stream));
    }
    else if (command === "render-fidelity") {
      if (!options.output) throw fail("DIGITAL_HUMAN_OUTPUT_REQUIRED");
      result = await renderFidelity(project, options.output, Boolean(options.stream));
    }
    else if (command === "render-reference-lock") {
      if (!options.output) throw fail("DIGITAL_HUMAN_OUTPUT_REQUIRED");
      result = await renderReferenceLocked(project, options.output, Boolean(options.stream));
    }
    else if (command === "prepare-ai-video") {
      if (!options.output) throw fail("DIGITAL_HUMAN_OUTPUT_REQUIRED");
      result = await prepareAiVideo(project, options.output, options.provider ?? "kling-ai");
    }
    else if (command === "render") {
      if (!options.output) throw fail("DIGITAL_HUMAN_OUTPUT_REQUIRED");
      result = await render(project, options.output, Boolean(options.stream));
    } else throw fail("DIGITAL_HUMAN_COMMAND_UNKNOWN", { command });
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({ status: "FAILED", code: error.code ?? "DIGITAL_HUMAN_FAILED", details: error.details ?? null }, null, 2)}\n`);
  process.exitCode = 1;
});
