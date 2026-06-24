import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const libDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(libDir, "..");

export const mobileStackPackPaths = {
  iosProject: resolve(packageRoot, "examples/ios-project.example.json"),
  androidProject: resolve(packageRoot, "examples/android-project.example.json"),
  workerRequirements: resolve(packageRoot, "examples/mobile-worker-requirements.example.json"),
  governanceGates: resolve(packageRoot, "examples/mobile-governance-gates.example.json")
};

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readDirectoryFiles(path, maxDepth = 3, depth = 0) {
  if (!existsSync(path) || depth > maxDepth) return [];
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith(".xcodeproj") || entry.name.endsWith(".xcworkspace")) {
        files.push(child);
        continue;
      }
      if (["node_modules", ".git", "Pods", "build", ".gradle", "DerivedData"].includes(entry.name)) continue;
      files.push(...await readDirectoryFiles(child, maxDepth, depth + 1));
    } else {
      files.push(child);
    }
  }
  return files;
}

function relativeEvidence(projectPath, files, predicate) {
  return files
    .filter(predicate)
    .map((file) => file.replace(`${projectPath}/`, ""))
    .sort();
}

async function loadProjectInput(projectPath, expectedPlatform) {
  const resolvedPath = resolve(projectPath);
  if (!existsSync(resolvedPath)) {
    return {
      source_kind: "missing_path",
      platform: expectedPlatform,
      project_id: `${expectedPlatform}-unknown`,
      project_root: resolvedPath,
      indicators: {},
      commands: {},
      signing: { mode: "reference_only" }
    };
  }

  const stats = await stat(resolvedPath);
  if (stats.isFile() && extname(resolvedPath) === ".json") {
    return readJson(resolvedPath);
  }

  const files = stats.isDirectory() ? await readDirectoryFiles(resolvedPath) : [];
  if (expectedPlatform === "ios") {
    return {
      source_kind: "directory_scan",
      platform: "ios",
      project_id: resolvedPath.split("/").filter(Boolean).at(-1) ?? "ios-project",
      project_root: resolvedPath,
      indicators: {
        xcode_projects: relativeEvidence(resolvedPath, files, (file) => file.endsWith(".xcodeproj")),
        xcode_workspaces: relativeEvidence(resolvedPath, files, (file) => file.endsWith(".xcworkspace")),
        languages: [
          ...new Set([
            ...(files.some((file) => file.endsWith(".swift")) ? ["Swift"] : []),
            ...(files.some((file) => file.includes("SwiftUI")) ? ["SwiftUI"] : []),
            ...(files.some((file) => file.endsWith(".m") || file.endsWith(".mm") || file.endsWith(".h")) ? ["Objective-C"] : [])
          ])
        ],
        dependency_files: relativeEvidence(resolvedPath, files, (file) => file.endsWith("/Podfile") || file.endsWith("/Package.swift")),
        simulator_targets: []
      },
      commands: {
        build: "xcodebuild build (planned, not executed)",
        test: "xcodebuild test (planned, not executed)",
        simulator_list: "xcrun simctl list devices (planned, not executed)"
      },
      signing: { mode: "reference_only" }
    };
  }

  return {
    source_kind: "directory_scan",
    platform: "android",
    project_id: resolvedPath.split("/").filter(Boolean).at(-1) ?? "android-project",
    project_root: resolvedPath,
    indicators: {
      gradle_files: relativeEvidence(resolvedPath, files, (file) => /\/(settings|build)\.gradle(\.kts)?$/.test(file) || file.endsWith("/gradlew")),
      languages: [
        ...new Set([
          ...(files.some((file) => file.endsWith(".kt")) ? ["Kotlin"] : []),
          ...(files.some((file) => file.endsWith(".java")) ? ["Java"] : [])
        ])
      ],
      android_manifests: relativeEvidence(resolvedPath, files, (file) => file.endsWith("/AndroidManifest.xml")),
      sdk: files.some((file) => file.endsWith("/local.properties")) ? "local.properties_present_reference_only" : "not_detected",
      gradle_wrapper: files.some((file) => file.endsWith("/gradlew")),
      emulator_targets: []
    },
    commands: {
      assemble: "./gradlew assembleDebug (planned, not executed)",
      test: "./gradlew test (planned, not executed)",
      emulator_list: "emulator -list-avds (planned, not executed)"
    },
    signing: { mode: "reference_only" }
  };
}

function indicator(name, evidence) {
  const values = Array.isArray(evidence) ? evidence : evidence ? [String(evidence)] : [];
  return {
    name,
    present: values.length > 0,
    evidence: values
  };
}

function statusFromIndicators(indicators, requiredNames) {
  const required = indicators.filter((item) => requiredNames.includes(item.name));
  const presentCount = required.filter((item) => item.present).length;
  if (presentCount === required.length) return "PASS";
  if (presentCount > 0) return "PARTIAL";
  return "FAIL";
}

export async function loadMobileStackPack() {
  const [iosProject, androidProject, workerRequirements, governanceGates] = await Promise.all([
    readJson(mobileStackPackPaths.iosProject),
    readJson(mobileStackPackPaths.androidProject),
    readJson(mobileStackPackPaths.workerRequirements),
    readJson(mobileStackPackPaths.governanceGates)
  ]);
  return {
    iosProject,
    androidProject,
    workerRequirements,
    governanceGates,
    paths: mobileStackPackPaths
  };
}

export async function detectIosProject(projectPath) {
  const input = await loadProjectInput(projectPath, "ios");
  const iosIndicators = input.indicators ?? {};
  const indicators = [
    indicator("xcode_project", iosIndicators.xcode_projects),
    indicator("xcode_workspace", iosIndicators.xcode_workspaces),
    indicator("swift_or_objc", iosIndicators.languages),
    indicator("dependency_manager", iosIndicators.dependency_files),
    indicator("simulator_target", iosIndicators.simulator_targets)
  ];
  return {
    schema_version: 1,
    platform: "ios",
    project_id: input.project_id ?? "ios-project",
    source_kind: input.source_kind ?? "unknown",
    project_root: input.project_root ?? projectPath,
    status: statusFromIndicators(indicators, ["xcode_project", "swift_or_objc"]),
    dry_run: true,
    indicators,
    command_detection: {
      xcodebuild: input.commands?.build ?? "xcodebuild build (planned, not executed)",
      test: input.commands?.test ?? "xcodebuild test (planned, not executed)",
      simulator_list: input.commands?.simulator_list ?? "xcrun simctl list devices (planned, not executed)"
    },
    signing: {
      mode: input.signing?.mode ?? "reference_only",
      references_only: true
    },
    safety: {
      xcodebuild_invocation: "disabled",
      simulator_invocation: "disabled",
      credential_values: "not_read",
      deploy: "disabled",
      production_operations: "disabled"
    }
  };
}

export async function detectAndroidProject(projectPath) {
  const input = await loadProjectInput(projectPath, "android");
  const androidIndicators = input.indicators ?? {};
  const indicators = [
    indicator("gradle_project", androidIndicators.gradle_files),
    indicator("kotlin_or_java", androidIndicators.languages),
    indicator("android_manifest", androidIndicators.android_manifests),
    indicator("android_sdk", androidIndicators.sdk && androidIndicators.sdk !== "not_detected" ? androidIndicators.sdk : []),
    indicator("gradle_wrapper", androidIndicators.gradle_wrapper ? ["gradlew"] : []),
    indicator("emulator_target", androidIndicators.emulator_targets)
  ];
  return {
    schema_version: 1,
    platform: "android",
    project_id: input.project_id ?? "android-project",
    source_kind: input.source_kind ?? "unknown",
    project_root: input.project_root ?? projectPath,
    status: statusFromIndicators(indicators, ["gradle_project", "kotlin_or_java", "android_manifest"]),
    dry_run: true,
    indicators,
    command_detection: {
      assemble: input.commands?.assemble ?? "./gradlew assembleDebug (planned, not executed)",
      test: input.commands?.test ?? "./gradlew test (planned, not executed)",
      emulator_list: input.commands?.emulator_list ?? "emulator -list-avds (planned, not executed)"
    },
    signing: {
      mode: input.signing?.mode ?? "reference_only",
      references_only: true
    },
    safety: {
      gradle_invocation: "disabled",
      emulator_invocation: "disabled",
      credential_values: "not_read",
      deploy: "disabled",
      production_operations: "disabled"
    }
  };
}

export function validateMobilePlatform(bundle, platform) {
  const workerRequirement = (bundle.workerRequirements.requirements ?? []).find((item) => item.platform === platform);
  const gates = bundle.governanceGates.gates ?? [];
  const requiredGateActions = platform === "ios"
    ? ["build", "simulator_test", "signing", "testflight_release", "app_store_release"]
    : ["build", "simulator_test", "signing", "google_play_release"];
  const selectedGates = gates.filter((gate) => requiredGateActions.includes(gate.action));
  const findings = [];
  if (!workerRequirement) findings.push(`Missing worker requirement for ${platform}.`);
  for (const gateAction of requiredGateActions) {
    if (!selectedGates.some((gate) => gate.action === gateAction)) findings.push(`Missing governance gate: ${gateAction}.`);
  }
  return {
    schema_version: 1,
    platform,
    status: findings.length === 0 ? "PASS" : "FAIL",
    dry_run: true,
    worker_requirement: workerRequirement ?? null,
    governance_gates: selectedGates,
    safety: {
      xcode_invocation: "disabled",
      gradle_invocation: "disabled",
      simulator_invocation: "disabled",
      emulator_invocation: "disabled",
      credential_values: "not_read",
      signing_assets: "reference_only",
      release_operation: "disabled",
      server_access: "disabled",
      production_operations: "disabled"
    },
    findings
  };
}
