import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { actionServerSummary, latestActionLog } from "./action-server.mjs";
import { accessInviteSummary, accessSummary, loadAccessCenter, resolveUserProfile } from "../../../packages/access-center/lib/access-center-utils.mjs";

const webDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(webDir, "../../..");

const dataFiles = {
  platformState: "runtime/global/platform-state.json",
  roadmapMemory: "runtime/global/roadmap-memory.json",
  v5Roadmap: "runtime/global/v5-roadmap.json",
  jinhuProjectState: "runtime/projects/jinhu-smart-park/project-state.json",
  codexContextIndex: "runtime/global/codex-context-index.json",
  decisionLog: "runtime/global/decision-log.json",
  accessState: "runtime/global/access-state.json",
  accessUsers: "runtime/global/access-users.json",
  accessMemberships: "runtime/global/access-memberships.json",
  accessInvites: "runtime/global/access-invites.json",
  consoleActions: "apps/console/examples/console-actions.example.json"
};

const exampleDirs = {
  runtimeCenter: "packages/runtime-center/examples",
  workerPool: "packages/worker-pool/examples",
  governanceCenter: "packages/governance-center/examples",
  credentialVault: "packages/credential-vault/examples",
  accessCenter: "packages/access-center/examples"
};

async function readJson(relativePath, fallback = null) {
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) return fallback;
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

async function readExampleDirectory(relativePath) {
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) return [];
  const entries = await readdir(absolutePath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(relativePath, entry.name))
    .sort();
  const records = [];
  for (const file of files) {
    records.push({
      path: file,
      data: await readJson(file, {})
    });
  }
  return records;
}

async function latestAutopilotRun() {
  const runsDir = resolve(repoRoot, "autopilot-runs");
  if (!existsSync(runsDir)) return null;
  const entries = await readdir(runsDir, { withFileTypes: true });
  const jsonFiles = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const absolutePath = join(runsDir, entry.name);
    const stats = await stat(absolutePath);
    jsonFiles.push({ absolutePath, mtimeMs: stats.mtimeMs });
  }
  jsonFiles.sort((a, b) => b.mtimeMs - a.mtimeMs || a.absolutePath.localeCompare(b.absolutePath));
  const latest = jsonFiles[0];
  if (!latest) return null;
  return {
    path: relative(repoRoot, latest.absolutePath),
    data: JSON.parse(await readFile(latest.absolutePath, "utf8"))
  };
}

function countArray(value, key) {
  if (Array.isArray(value)) return value.length;
  if (value && Array.isArray(value[key])) return value[key].length;
  return 0;
}

function firstValue(record, paths, fallback = "unknown") {
  for (const path of paths) {
    let cursor = record;
    for (const segment of path.split(".")) {
      cursor = cursor?.[segment];
    }
    if (cursor !== undefined && cursor !== null && cursor !== "") return cursor;
  }
  return fallback;
}

export async function loadConsoleLocalData() {
  const [
    platformState,
    roadmapMemory,
    v5Roadmap,
    jinhuProjectState,
    codexContextIndex,
    decisionLog,
    accessState,
    accessUsers,
    accessMemberships,
    accessInvites,
    consoleActions,
    runtimeCenterExamples,
    workerPoolExamples,
    governanceCenterExamples,
    credentialVaultExamples,
    accessCenterExamples,
    latestRun,
    latestConsoleActionLog
  ] = await Promise.all([
    readJson(dataFiles.platformState, {}),
    readJson(dataFiles.roadmapMemory, {}),
    readJson(dataFiles.v5Roadmap, {}),
    readJson(dataFiles.jinhuProjectState, {}),
    readJson(dataFiles.codexContextIndex, {}),
    readJson(dataFiles.decisionLog, {}),
    readJson(dataFiles.accessState, {}),
    readJson(dataFiles.accessUsers, {}),
    readJson(dataFiles.accessMemberships, {}),
    readJson(dataFiles.accessInvites, {}),
    readJson(dataFiles.consoleActions, {}),
    readExampleDirectory(exampleDirs.runtimeCenter),
    readExampleDirectory(exampleDirs.workerPool),
    readExampleDirectory(exampleDirs.governanceCenter),
    readExampleDirectory(exampleDirs.credentialVault),
    readExampleDirectory(exampleDirs.accessCenter),
    latestAutopilotRun(),
    latestActionLog()
  ]);

  const runtimeProfiles = runtimeCenterExamples.find((item) => item.path.endsWith("runtime-profiles.example.json"))?.data;
  const runtimeProviders = runtimeCenterExamples.find((item) => item.path.endsWith("runtime-providers.example.json"))?.data;
  const workerRegistry = workerPoolExamples.find((item) => item.path.endsWith("worker-registry.example.json"))?.data;
  const credentialReferences = credentialVaultExamples.find((item) => item.path.endsWith("credential-references.example.json"))?.data;
  const backendPolicy = credentialVaultExamples.find((item) => item.path.endsWith("backend-policy.example.json"))?.data;
  const governancePolicy = governanceCenterExamples.find((item) => item.path.endsWith("governance-policy.example.json"))?.data;
  const releaseGates = governanceCenterExamples.find((item) => item.path.endsWith("release-gates.example.json"))?.data;
  const accessBundle = await loadAccessCenter();
  const bootstrapAccessProfile = resolveUserProfile(accessBundle, accessBundle.policy.default_console_user_id);

  return {
    loaded_at: new Date().toISOString(),
    data_sources: {
      files: Object.values(dataFiles),
      directories: Object.values(exampleDirs),
      autopilot_latest: latestRun?.path ?? "autopilot-runs/latest:not_found"
    },
    platformState,
    roadmapMemory,
    v5Roadmap,
    jinhuProjectState,
    codexContextIndex,
    decisionLog,
    accessState,
    accessUsers,
    accessMemberships,
    accessInvites,
    consoleActions,
    actionServer: actionServerSummary(),
    runtime: {
      examples: runtimeCenterExamples,
      profile_count: countArray(runtimeProfiles?.profiles, "profiles"),
      provider_count: countArray(runtimeProviders?.providers, "providers"),
      health_records: runtimeCenterExamples.find((item) => item.path.endsWith("runtime-health.example.json"))?.data ?? {}
    },
    workers: {
      examples: workerPoolExamples,
      registry: workerRegistry ?? {},
      worker_count: countArray(workerRegistry?.workers, "workers")
    },
    credentials: {
      examples: credentialVaultExamples,
      reference_count: countArray(credentialReferences?.credential_references, "credential_references"),
      backend_count: countArray(backendPolicy?.backends, "backends")
    },
    governance: {
      examples: governanceCenterExamples,
      policy_id: firstValue(governancePolicy ?? {}, ["policy_id"], "unknown"),
      release_gate_count: countArray(releaseGates?.release_gates, "release_gates")
    },
    access: {
      examples: accessCenterExamples,
      summary: accessSummary(accessBundle, bootstrapAccessProfile),
      invite_summary: accessInviteSummary(accessBundle),
      user_count: countArray(accessUsers?.users, "users"),
      membership_count: countArray(accessMemberships?.memberships, "memberships"),
      invite_count: countArray(accessInvites?.invites, "invites"),
      plan_count: countArray(accessBundle.plans?.plans, "plans"),
      default_console_user: bootstrapAccessProfile.user ?? null
    },
    autopilot: {
      latest: latestRun,
      latest_summary: latestRun ? {
        id: firstValue(latestRun.data, ["run_id", "batch_id", "id"], latestRun.path),
        execution_mode: firstValue(latestRun.data, ["execution_mode", "execution.mode"], "unknown"),
        next_recommendation: firstValue(latestRun.data, ["next_recommendation.title", "next_recommendation", "summary.next_recommendation"], "unknown"),
        validation: firstValue(latestRun.data, ["validation_result.status", "validation.status"], "unknown")
      } : null
    },
    action_log: {
      latest: latestConsoleActionLog,
      latest_path: latestConsoleActionLog?.path ?? "not_found",
      latest_summary: latestConsoleActionLog?.data?.result?.stdout_summary ?? "not_found"
    },
    safety: {
      database: "not_connected",
      external_calls: "disabled",
      credential_values: "not_read",
      managed_project_writes: "disabled",
      deploy: "disabled",
      production_operations: "disabled",
      model_invocation: "disabled",
      phoenix_erp_local_path: "not_connected",
      anonymous_console_access: accessBundle.policy.allow_anonymous_console_read ? "enabled" : "disabled"
    }
  };
}

export async function buildConsoleDashboardModel() {
  const data = await loadConsoleLocalData();
  return {
    title: "ANKSEN Agent Studio",
    mode: "local_read_only_pilot",
    platform_status: firstValue(data.platformState, ["status", "platform_status"], "READY_FOR_PILOT"),
    v5_status: "READY_FOR_PILOT",
    active_project: "jinhu-smart-park",
    project_status: firstValue(data.jinhuProjectState, ["status", "project_status", "doctor_status"], "connected"),
    modules: {
      runtime_profiles: data.runtime.profile_count,
      runtime_providers: data.runtime.provider_count,
      workers: data.workers.worker_count,
      credential_references: data.credentials.reference_count,
      credential_backends: data.credentials.backend_count,
      governance_release_gates: data.governance.release_gate_count,
      access_users: data.access.user_count,
      access_plans: data.access.plan_count,
      latest_autopilot_run: data.autopilot.latest?.path ?? "not_found"
    },
    safety: data.safety,
    data_sources: data.data_sources,
    access: data.access.summary
  };
}
