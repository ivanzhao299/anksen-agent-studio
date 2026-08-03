import { createHash } from "node:crypto";

const priorities = Object.freeze({ P0: 0, P1: 1, P2: 2, P3: 3 });
const terminalStatuses = new Set(["AWAITING_DIFF_APPROVAL", "NEEDS_REWORK", "FAILED", "CANCELLED", "COMMITTED"]);
const secretPatterns = [
  /sk-[A-Za-z0-9_-]{12,}/g,
  /(?:api[_-]?key|password|secret|token)\s*[:=]\s*[^\s,;]+/gi,
  /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
];

export const sha256 = value => createHash("sha256").update(String(value)).digest("hex");

export function redactEvidence(value) {
  let text = String(value ?? "");
  for (const pattern of secretPatterns) text = text.replace(pattern, "[REDACTED]");
  return { text, redacted: text !== String(value ?? "") };
}

export function normalizeQueuePolicy(input = {}) {
  const priority = String(input.priority ?? "P2").toUpperCase();
  if (!(priority in priorities)) throw Object.assign(new Error("QUEUE_PRIORITY_INVALID"), { code: "QUEUE_PRIORITY_INVALID" });
  const maintenanceWindow = input.maintenanceWindow ?? null;
  if (maintenanceWindow) {
    for (const field of ["startHourUtc", "endHourUtc"]) {
      if (!Number.isInteger(maintenanceWindow[field]) || maintenanceWindow[field] < 0 || maintenanceWindow[field] > 23) throw Object.assign(new Error("MAINTENANCE_WINDOW_INVALID"), { code: "MAINTENANCE_WINDOW_INVALID" });
    }
  }
  return { priority, maintenanceWindow, perProjectConcurrency: 1, globalConcurrency: 1 };
}

export function maintenanceWindowOpen(window, now = new Date()) {
  if (!window) return true;
  const hour = now.getUTCHours(), { startHourUtc: start, endHourUtc: end } = window;
  return start === end || (start < end ? hour >= start && hour < end : hour >= start || hour < end);
}

export function orderQueue(jobs, now = new Date()) {
  const activeProjects = new Set(jobs.filter(job => job.status === "RUNNING").map(job => job.projectId));
  return jobs.filter(job => job.status === "QUEUED" && !activeProjects.has(job.projectId) && maintenanceWindowOpen(job.queuePolicy?.maintenanceWindow, now)).sort((a, b) => {
    const priority = (priorities[a.queuePolicy?.priority ?? "P2"] ?? 2) - (priorities[b.queuePolicy?.priority ?? "P2"] ?? 2);
    if (priority) return priority;
    const aWait = new Date(a.queuedAt ?? a.createdAt).getTime(), bWait = new Date(b.queuedAt ?? b.createdAt).getTime();
    return aWait - bWait || String(a.projectId).localeCompare(String(b.projectId));
  });
}

export function acceptanceEvidence(criteria, commands, provided = []) {
  const rows = criteria.map((criterion, index) => {
    const match = provided.find(item => item.criterion === criterion || item.criterionIndex === index);
    if (!match) return { criterion, type: "MISSING", reference: null, status: "BLOCKED" };
    const type = String(match.type ?? "").toUpperCase();
    if (!['COMMAND', 'TEST', 'REVIEW'].includes(type)) return { criterion, type: "MISSING", reference: null, status: "BLOCKED" };
    const reference = String(match.reference ?? "").trim();
    const commandKnown = !["COMMAND", "TEST"].includes(type) || commands.includes(reference);
    return { criterion, type, reference, status: reference && commandKnown ? "MAPPED" : "BLOCKED" };
  });
  return { status: rows.every(row => row.status === "MAPPED") ? "READY" : "BLOCKED", criteria: rows };
}

export function normalizeResourceBudget(input = {}, runtimeSeconds = 1800) {
  const budget = {
    maxInputTokens: Number(input.maxInputTokens ?? 500_000),
    maxOutputTokens: Number(input.maxOutputTokens ?? 50_000),
    maxTotalRuntimeSeconds: Number(input.maxTotalRuntimeSeconds ?? Math.min(3600, runtimeSeconds * 5)),
    dailyProjectRuntimeSeconds: Number(input.dailyProjectRuntimeSeconds ?? 14_400),
  };
  if (Object.values(budget).some(value => !Number.isInteger(value) || value <= 0)) throw Object.assign(new Error("RESOURCE_BUDGET_INVALID"), { code: "RESOURCE_BUDGET_INVALID" });
  return budget;
}

export function resourceBudgetDecision(job, projectJobs = [], now = new Date()) {
  const usage = job.tokenUsage ?? {};
  const elapsedSeconds = job.startedAt ? Math.max(0, (now.getTime() - new Date(job.startedAt).getTime()) / 1000) : 0;
  const day = now.toISOString().slice(0, 10);
  const projectRuntime = projectJobs.filter(item => item.projectId === job.projectId && String(item.startedAt ?? "").startsWith(day)).reduce((sum, item) => sum + Number(item.runtimeUsageSeconds ?? 0), 0);
  const reasons = [];
  if (Number(usage.inputTokens ?? 0) > job.resourceBudget.maxInputTokens) reasons.push("INPUT_TOKEN_BUDGET_EXHAUSTED");
  if (Number(usage.outputTokens ?? 0) > job.resourceBudget.maxOutputTokens) reasons.push("OUTPUT_TOKEN_BUDGET_EXHAUSTED");
  if (elapsedSeconds > job.resourceBudget.maxTotalRuntimeSeconds) reasons.push("RUNTIME_BUDGET_EXHAUSTED");
  if (projectRuntime > job.resourceBudget.dailyProjectRuntimeSeconds) reasons.push("DAILY_PROJECT_RUNTIME_BUDGET_EXHAUSTED");
  return { action: reasons.length ? "STOP" : "CONTINUE", reasons, elapsedSeconds, projectRuntimeSeconds: projectRuntime };
}

export function releaseAssistance(job) {
  const slug = String(job.goal).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "governed-change";
  return {
    suggestedCommitMessage: `feat(autonomous): ${String(job.goal).slice(0, 60)}`,
    suggestedBranch: `codex/${slug}`,
    pullRequestSummary: `Implements ${job.goal}\n\nValidation: ${job.validation?.status ?? "NOT_RUN"}\nChanged paths: ${(job.changedPaths ?? []).join(", ") || "none"}`,
    riskNotes: job.delivery?.riskFindings ?? [],
    rollbackInstructions: "Revert the approved local commit after verifying no external side effects. No push, merge, deploy, migration, or production write was performed automatically.",
    requiresSeparateApproval: ["commit", "push", "merge", "deploy", "production"],
  };
}

export function operationalSnapshot(jobs, worker, now = new Date()) {
  const terminal = jobs.filter(job => terminalStatuses.has(job.status));
  const durations = terminal.map(job => job.startedAt && job.finishedAt ? new Date(job.finishedAt) - new Date(job.startedAt) : 0).filter(value => value >= 0);
  const alerts = [];
  if (["OFFLINE", "CRASH_LOOP"].includes(worker.status)) alerts.push({ code: "WORKER_UNAVAILABLE", severity: "HIGH", detail: worker.reason ?? worker.status });
  for (const job of jobs) {
    if (["QUEUED", "RUNNING"].includes(job.status) && job.approvalExpiresAt && new Date(job.approvalExpiresAt) <= now) alerts.push({ code: "APPROVAL_EXPIRED", severity: "MEDIUM", jobId: job.id });
    if (job.status === "RUNNING" && now - new Date(job.updatedAt) > 15 * 60 * 1000) alerts.push({ code: "STAGE_STUCK", severity: "HIGH", jobId: job.id, stage: job.stage });
    if (["WORKSPACE_SCOPE_DRIFT", "PROJECT_BASELINE_CHANGED"].includes(job.error?.code)) alerts.push({ code: "SCOPE_DRIFT", severity: "HIGH", jobId: job.id });
  }
  return {
    generatedAt: now.toISOString(),
    queueDepth: jobs.filter(job => job.status === "QUEUED").length,
    running: jobs.filter(job => job.status === "RUNNING").length,
    terminal: terminal.length,
    successRate: terminal.length ? terminal.filter(job => ["AWAITING_DIFF_APPROVAL", "COMMITTED"].includes(job.status)).length / terminal.length : null,
    repairRate: terminal.length ? terminal.filter(job => Number(job.repairAttemptsUsed ?? 0) > 0).length / terminal.length : null,
    cancellationRate: terminal.length ? terminal.filter(job => job.status === "CANCELLED").length / terminal.length : null,
    recoveryRate: terminal.length ? terminal.filter(job => job.recovery).length / terminal.length : null,
    averageStageLatencyMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    tokens: jobs.reduce((sum, job) => sum + Number(job.tokenUsage?.inputTokens ?? 0) + Number(job.tokenUsage?.outputTokens ?? 0), 0),
    runtimeSeconds: jobs.reduce((sum, job) => sum + Number(job.runtimeUsageSeconds ?? 0), 0),
    alerts,
  };
}

export function validatePilotEvidence(jobs) {
  const violations = [];
  if (jobs.length < 10) violations.push("TEN_JOB_MINIMUM_NOT_MET");
  if (new Set(jobs.map(job => job.projectId)).size < 2) violations.push("TWO_PROJECT_MINIMUM_NOT_MET");
  for (const job of jobs) {
    if ((job.changedPaths ?? []).some(path => !(job.allowedPaths ?? []).some(allowed => path === allowed || path.startsWith(`${allowed.replace(/\/$/, "")}/`)))) violations.push(`PATH_ESCAPE:${job.id}`);
    if ((job.agentInstances ?? []).filter(agent => agent.status === "RUNNING").length > 1) violations.push(`DUPLICATE_ATTEMPT:${job.id}`);
    if (job.commit?.pushed || job.delivery?.automaticActions?.push || job.delivery?.automaticActions?.merge || job.delivery?.automaticActions?.deploy) violations.push(`UNAUTHORIZED_RELEASE:${job.id}`);
    if (!(job.artifacts ?? []).every(artifact => artifact.sha256)) violations.push(`MISSING_ARTIFACT_HASH:${job.id}`);
  }
  return { status: violations.length ? "BLOCKED" : "PASS", jobCount: jobs.length, projectCount: new Set(jobs.map(job => job.projectId)).size, violations };
}
