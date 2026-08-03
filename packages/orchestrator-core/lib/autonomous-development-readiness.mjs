import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const ready = (id, label, detail, remediation = null) => ({ id, label, status: "READY", detail, remediation });
const blocked = (id, label, detail, remediation) => ({ id, label, status: "BLOCKED", detail, remediation });

async function executable(path) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function loadJobs(root) {
  const dir = resolve(root, "runtime/autonomous-development/jobs");
  try {
    return await Promise.all((await readdir(dir))
      .filter((name) => name.endsWith(".json"))
      .map((name) => readJson(resolve(dir, name))));
  } catch {
    return [];
  }
}

export async function assessAutonomousDevelopmentReadiness({
  root = process.cwd(),
  now = new Date(),
  codexPath = "/Applications/ChatGPT.app/Contents/Resources/codex",
  heartbeatTimeoutMs = 15_000,
} = {}) {
  const repositoryRoot = resolve(root);
  const heartbeat = await readJson(resolve(repositoryRoot, "runtime/autonomous-development/worker-heartbeat.json"));
  const supervisor = await readJson(resolve(repositoryRoot,"runtime/autonomous-development/supervisor-state.json"));
  const v3Pilot = await readJson(resolve(repositoryRoot,"runtime/autonomous-development/v3-pilot-report.json"));
  const heartbeatAgeMs = heartbeat?.lastHeartbeatAt
    ? Math.max(0, now.getTime() - new Date(heartbeat.lastHeartbeatAt).getTime())
    : null;
  const workerOnline = heartbeatAgeMs !== null && heartbeatAgeMs <= heartbeatTimeoutMs;
  const jobs = (await loadJobs(repositoryRoot)).filter(Boolean);
  const workerSource = await readFile(resolve(repositoryRoot, "packages/orchestrator-core/bin/autonomous-development-worker.mjs"), "utf8").catch(() => "");
  const boundedRepairImplemented = ["repairDecision", "expectedBaselineDigest", "REPAIR_DECISION"].every((pattern) => workerSource.includes(pattern));
  const provenJob = jobs.find((job) =>
    ["AWAITING_DIFF_APPROVAL", "COMMITTED"].includes(job.status)
    && ["PLANNER", "IMPLEMENTER", "VALIDATOR", "REVIEWER"].every((role) =>
      job.agentInstances?.some((agent) => agent.role === role && agent.runtimeType === "CODEX" && agent.status === "SUCCEEDED")));

  const checks = [
    ready("control-plane", "Control plane", "Planner, Kernel, Scheduler, Worker, Runtime Adapter, and Activation Gate evidence is versioned in this repository."),
    (await executable(codexPath))
      ? ready("codex-cli", "Codex CLI", `Executable found at ${codexPath}.`)
      : blocked("codex-cli", "Codex CLI", `No executable found at ${codexPath}.`, "Install or configure the governed Codex CLI path."),
    workerOnline
      ? ready("resident-worker", "Resident development worker", `Worker ${heartbeat.workerId ?? "unknown"} is ${heartbeat.status ?? "ONLINE"}; heartbeat age ${heartbeatAgeMs}ms.`)
      : blocked("resident-worker", "Resident development worker", heartbeat ? `Last heartbeat is ${heartbeatAgeMs}ms old.` : "No worker heartbeat exists.", "Start the autonomous development worker service and verify its heartbeat."),
    provenJob
      ? ready("proven-run", "Proven governed development run", `Job ${provenJob.id} completed Planner, Implementer, Validator, and Reviewer stages with real CODEX evidence.`)
      : blocked("proven-run", "Proven governed development run", "No completed four-role governed Codex job is available as runtime evidence.", "Run one approved non-production development job through diff review."),
    ready("recovery", "Persistent recovery", "Jobs, artifacts, worker heartbeat, and uncertain-state recovery are persisted; unsafe attempts are not blindly replayed."),
    boundedRepairImplemented
      ? ready("bounded-repair", "Bounded automatic repair", "The resident worker enforces an approved repair budget, workspace digest, path scope, and non-improvement stop condition.")
      : blocked("bounded-repair", "Bounded automatic repair", "Validation stops at NEEDS_REWORK instead of performing a policy-bounded repair attempt.", "Implement ADV2-030 with an explicit repair budget and non-improvement stop condition."),
  ];

  const runtimeReady = checks.find((item) => item.id === "codex-cli").status === "READY"
    && checks.find((item) => item.id === "resident-worker").status === "READY";
  const autonomousReady = runtimeReady
    && checks.find((item) => item.id === "proven-run").status === "READY"
    && checks.find((item) => item.id === "bounded-repair").status === "READY";
  const interventionPolicy = {
    automatable: ["repository preflight", "planning", "implementation steps inside approved paths", "validation", "report generation"],
    scopedOnce: ["real CODEX job approval including project, paths, checks, duration, and repair budget"],
    alwaysHuman: ["ambiguous requirement resolution", "diff approval and local commit", "push", "merge", "deploy", "production operations", "secret-value access"],
  };
  const operationalPilotReady=supervisor?.status==="HEALTHY"&&v3Pilot?.status==="PASS"&&v3Pilot?.executionMode==="CONTROLLED_POLICY_PILOT";

  return {
    schemaVersion: 1,
    status: autonomousReady ? "AUTONOMOUS_DEVELOPMENT_READY" : runtimeReady ? "CODEX_RUNTIME_READY" : "CONTROL_PLANE_READY",
    generatedAt: now.toISOString(),
    summary: { ready: checks.filter((item) => item.status === "READY").length, total: checks.length },
    maturity: { controlPlane: "READY", codexRuntime: runtimeReady ? "READY" : "NOT_READY", autonomousDevelopment: autonomousReady ? "READY" : "NOT_READY",operationalReliability:operationalPilotReady?"CONTROLLED_PILOT_READY":"NOT_READY",productionAutonomy:"DISABLED" },
    checks,
    interventionPolicy,
    safety: { realRuntimeEnabledPersistently: false, automaticCommit: false, automaticPush: false, automaticMerge: false, automaticDeploy: false },
    v3:{supervisor:supervisor??{status:"NOT_CONFIGURED"},pilot:v3Pilot?{status:v3Pilot.status,executionMode:v3Pilot.executionMode,jobCount:v3Pilot.validation?.jobCount,projectCount:v3Pilot.validation?.projectCount}:null,claim:"Controlled operational pilot only; production autonomy is not enabled."},
  };
}
