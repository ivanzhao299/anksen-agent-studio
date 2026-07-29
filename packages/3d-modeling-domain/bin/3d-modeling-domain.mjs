#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  buildGaugeDrivenCalibrationPlan,
  buildInverseRenderFidelityPlan,
  buildOrbitReferenceCalibrationPlan,
  buildParametricCharacterExecutionPlan,
  buildModelingExecutionPlan,
  validateGaugeDrivenCalibration,
  validateInverseRenderFidelityWorkflow,
  validateOrbitReferenceCalibration,
  validateParametricCharacterWorkflow,
  validateModelingWorkflow
} from "../lib/3d-modeling-domain.mjs";

const [command = "plan", ...argv] = process.argv.slice(2);
const valueAfter = flag => {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
};

if (command === "surface-quality") {
  const mesh = valueAfter("--mesh");
  const output = valueAfter("--output");
  const sourceMesh = valueAfter("--source-mesh");
  const featureAngleDegrees = valueAfter("--feature-angle-degrees");
  const featureZoneVoxelRadius = valueAfter("--feature-zone-voxel-radius");
  if (!mesh || !output) {
    throw new Error("MODELING_SURFACE_QUALITY_PATHS_REQUIRED");
  }
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = resolve(packageRoot, "../..");
  const pythonCandidates = [
    process.env.MODELING_PYTHON,
    resolve(packageRoot, ".venv/bin/python"),
    resolve(repoRoot, "packages/digital-human-pipeline/.venv-reconstruction/bin/python"),
    resolve(repoRoot, "packages/digital-human-pipeline/.venv/bin/python"),
    "python3"
  ].filter(Boolean);
  const python = pythonCandidates.find(candidate =>
    candidate === "python3" || existsSync(candidate)
  );
  const commandArguments = [
    resolve(packageRoot, "python/analyze_surface_quality.py"),
    "--mesh",
    resolve(mesh),
    "--output",
    resolve(output)
  ];
  if (sourceMesh) {
    commandArguments.push("--source-mesh", resolve(sourceMesh));
  }
  if (featureAngleDegrees) {
    commandArguments.push("--feature-angle-degrees", featureAngleDegrees);
  }
  if (featureZoneVoxelRadius) {
    commandArguments.push("--feature-zone-voxel-radius", featureZoneVoxelRadius);
  }
  const { stdout } = await promisify(execFile)(
    python,
    commandArguments,
    { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 }
  );
  process.stdout.write(stdout);
  process.exit(0);
}

const configIndex = argv.indexOf("--config");
if (configIndex < 0 || !argv[configIndex + 1]) {
  throw new Error("MODELING_CONFIG_REQUIRED");
}
const config = JSON.parse(await readFile(resolve(argv[configIndex + 1]), "utf8"));
const isParametric = config.constructionMode === "GEOMETRY_FIRST";
const isOrbitCalibration =
  config.calibrationMode === "AI_ORBIT_REFERENCE_CALIBRATION";
const isInverseRenderFidelity =
  config.evaluationMode === "HIGH_RESOLUTION_INVERSE_RENDER_ALIGNMENT";
const isGaugeCalibration =
  config.calibrationMode === "GAUGE_DRIVEN_MULTIVIEW_GEOMETRY";
const result =
  command === "validate"
    ? {
        status: "PASS",
        workflow: isGaugeCalibration
          ? validateGaugeDrivenCalibration(config)
          : isInverseRenderFidelity
          ? validateInverseRenderFidelityWorkflow(config)
          : isOrbitCalibration
          ? validateOrbitReferenceCalibration(config)
          : isParametric
          ? validateParametricCharacterWorkflow(config)
          : validateModelingWorkflow(config)
      }
    : command === "plan"
      ? isGaugeCalibration
        ? buildGaugeDrivenCalibrationPlan(config)
        : isInverseRenderFidelity
        ? buildInverseRenderFidelityPlan(config)
        : isOrbitCalibration
        ? buildOrbitReferenceCalibrationPlan(config)
        : isParametric
        ? buildParametricCharacterExecutionPlan(config)
        : buildModelingExecutionPlan(config)
      : (() => {
          throw new Error(`MODELING_COMMAND_UNSUPPORTED:${command}`);
        })();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
