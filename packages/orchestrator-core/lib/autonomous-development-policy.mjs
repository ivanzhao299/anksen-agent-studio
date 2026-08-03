import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const stable = (value) => JSON.stringify(value, Object.keys(value).sort());

function git(root, args) {
  return spawnSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}

export function pathAllowed(path, allowedPaths) {
  return allowedPaths.some((allowed) => path === allowed || path.startsWith(`${allowed.replace(/\/$/, "")}/`));
}

export function captureGitWorkspace(root) {
  const projectRoot = resolve(root);
  const status = git(projectRoot, ["status", "--short", "--untracked-files=all"]);
  if (status.status !== 0) throw Object.assign(new Error("GIT_STATUS_FAILED"), { code: "GIT_STATUS_FAILED" });
  const paths = status.stdout.split("\n").filter(Boolean).map((line) => line.slice(3).split(" -> ").at(-1));
  const hasHead = git(projectRoot, ["rev-parse", "--verify", "HEAD"]).status === 0;
  const tracked = hasHead ? git(projectRoot, ["diff", "--binary", "HEAD", "--"]) : { status: 0, stdout: "" };
  if (tracked.status !== 0) throw Object.assign(new Error("GIT_DIFF_FAILED"), { code: "GIT_DIFF_FAILED" });
  const untracked = paths.filter((path) => status.stdout.split("\n").some((line) => line.startsWith("?? ") && line.slice(3) === path));
  const untrackedEvidence = untracked.map((path) => {
    try { return `${path}:${hash(readFileSync(resolve(projectRoot, path)))}`; }
    catch { return `${path}:UNREADABLE`; }
  }).join("\n");
  return { paths, status: status.stdout, digest: hash(`${status.stdout}\n${tracked.stdout}\n${untrackedEvidence}`) };
}

export function assertWorkspaceWithinScope(snapshot, allowedPaths) {
  const denied = snapshot.paths.filter((path) => !pathAllowed(path, allowedPaths));
  if (denied.length) throw Object.assign(new Error(`WORKSPACE_SCOPE_DRIFT:${denied.join(",")}`), { code: "WORKSPACE_SCOPE_DRIFT", deniedPaths: denied });
  return snapshot;
}

export function approvalScopeDigest(scope) {
  const normalized = {
    projectId: scope.projectId,
    projectRoot: resolve(scope.projectRoot),
    allowedPaths: [...scope.allowedPaths].sort(),
    blockedPaths: [...scope.blockedPaths].sort(),
    acceptanceCommands: [...scope.acceptanceCommands],
    maxRuntimeSeconds: Number(scope.maxRuntimeSeconds),
    maxRepairAttempts: Number(scope.maxRepairAttempts),
    commit: false,
    push: false,
    merge: false,
    deploy: false,
  };
  return hash(stable(normalized));
}

export function validationFingerprint(validation) {
  return hash(JSON.stringify((validation?.checks ?? []).map((item) => ({ command: item.command, status: item.status, output: String(item.output ?? "").slice(-4000) }))));
}

export function repairDecision({ validation, previousFingerprints = [], repairsUsed = 0, maxRepairAttempts = 0 }) {
  if (validation?.status === "PASS") return { action: "CONTINUE", reason: "VALIDATION_PASS" };
  if (repairsUsed >= maxRepairAttempts) return { action: "STOP", reason: "REPAIR_BUDGET_EXHAUSTED" };
  const fingerprint = validationFingerprint(validation);
  if (previousFingerprints.includes(fingerprint)) return { action: "STOP", reason: "NON_IMPROVING_VALIDATION", fingerprint };
  return { action: "REPAIR", reason: "VALIDATION_FAILED_WITHIN_BUDGET", fingerprint, attempt: repairsUsed + 1 };
}

export function deliveryReport(job) {
  const validation = job.validation ?? { status: "NOT_RUN", checks: [] };
  const riskFindings = [];
  if (!job.changedPaths?.length) riskFindings.push("NO_CHANGED_PATHS");
  if (validation.status !== "PASS") riskFindings.push("VALIDATION_NOT_PASSING");
  if ((job.repairAttemptsUsed ?? 0) > 0) riskFindings.push("REPAIR_ATTEMPTS_USED");
  return {
    schemaVersion: 1,
    jobId: job.id,
    goal: job.goal,
    status: job.status,
    projectId: job.projectId,
    approvalScopeDigest: job.approvalScopeDigest,
    changedPaths: [...(job.changedPaths ?? [])],
    validation,
    repairBudget: { used: job.repairAttemptsUsed ?? 0, maximum: job.maxRepairAttempts ?? 0 },
    riskFindings,
    suggestedCommitMessage: `feat(autonomous): ${String(job.goal).slice(0, 60)}`,
    automaticActions: { commit: false, push: false, merge: false, deploy: false },
    nextAction: validation.status === "PASS" ? "HUMAN_DIFF_REVIEW" : "HUMAN_REWORK_DECISION",
  };
}
