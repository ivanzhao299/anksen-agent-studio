import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const hash = value => createHash("sha256").update(String(value)).digest("hex");

export class BranchLifecycleGovernorError extends Error {
  constructor(code, message = code, details = {}) {
    super(message);
    this.name = "BranchLifecycleGovernorError";
    this.code = code;
    Object.assign(this, details);
  }
}

function runGit(root, args, { allowFailure = false, env = process.env } = {}) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 32 * 1024 * 1024,
    env,
  });
  if (result.error) throw new BranchLifecycleGovernorError("GIT_COMMAND_FAILED", result.error.message, { args });
  if (result.status !== 0 && !allowFailure) {
    throw new BranchLifecycleGovernorError("GIT_COMMAND_FAILED", String(result.stderr || result.stdout).trim(), { args });
  }
  return { ok: result.status === 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function canonicalRoot(projectRoot) {
  const root = realpathSync(resolve(projectRoot));
  const top = runGit(root, ["rev-parse", "--show-toplevel"]).stdout;
  if (realpathSync(resolve(top)) !== root) throw new BranchLifecycleGovernorError("PROJECT_ROOT_MISMATCH");
  return root;
}

function parseWorktreeBranches(value) {
  return new Set(String(value).split("\n").filter(line => line.startsWith("branch refs/heads/")).map(line => line.slice("branch refs/heads/".length)));
}

function stablePlanValue(plan) {
  const { fingerprint: _fingerprint, generatedAt: _generatedAt, ...stable } = plan;
  return JSON.stringify(stable);
}

export function isBranchContentEquivalent(root, branchRef, defaultRef) {
  const base = runGit(root, ["merge-base", branchRef, defaultRef], { allowFailure: true });
  if (!base.ok || !base.stdout) return false;
  const paths = runGit(root, ["diff", "--name-only", `${base.stdout}..${branchRef}`]).stdout.split("\n").filter(Boolean);
  if (!paths.length) return true;
  return paths.every(path => {
    const branchBlob = runGit(root, ["rev-parse", `${branchRef}:${path}`], { allowFailure: true });
    const defaultBlob = runGit(root, ["rev-parse", `${defaultRef}:${path}`], { allowFailure: true });
    return branchBlob.ok === defaultBlob.ok && (!branchBlob.ok || branchBlob.stdout === defaultBlob.stdout);
  });
}

export class BranchLifecycleGovernor {
  constructor({ clock = () => new Date(), maxPlanAgeMs = 15 * 60 * 1000 } = {}) {
    this.clock = clock;
    this.maxPlanAgeMs = maxPlanAgeMs;
  }

  audit({ projectId, projectRoot, remote = "origin", defaultBranch = "main", retentionDays = 90, protectedBranches = [], openPrBranches = [], fetch = true }) {
    if (!projectId || !Number.isInteger(retentionDays) || retentionDays < 0) throw new BranchLifecycleGovernorError("INVALID_POLICY");
    const root = canonicalRoot(projectRoot);
    if (fetch) runGit(root, ["fetch", "--prune", "--no-tags", remote, defaultBranch]);
    const defaultRef = `${remote}/${defaultBranch}`;
    const defaultHead = runGit(root, ["rev-parse", "--verify", defaultRef]).stdout;
    const remoteUrlHash = hash(runGit(root, ["remote", "get-url", remote]).stdout);
    const protectedSet = new Set([defaultBranch, ...protectedBranches]);
    const openSet = new Set(openPrBranches);
    const worktreeSet = parseWorktreeBranches(runGit(root, ["worktree", "list", "--porcelain"]).stdout);
    const now = this.clock();
    const rows = runGit(root, ["for-each-ref", "--format=%(refname:strip=3)%09%(objectname)%09%(committerdate:unix)%09%(committerdate:iso8601-strict)", `refs/remotes/${remote}`]).stdout
      .split("\n").filter(Boolean).filter(line => !line.startsWith("HEAD\t"))
      .map(line => {
        const [branch, tip, unix, committedAt] = line.split("\t");
        const ageDays = Math.max(0, Math.floor((now.getTime() / 1000 - Number(unix)) / 86400));
        const merged = runGit(root, ["merge-base", "--is-ancestor", tip, defaultHead], { allowFailure: true }).ok;
        let action;
        if (branch === defaultBranch) action = "KEEP_DEFAULT";
        else if (protectedSet.has(branch)) action = "KEEP_PROTECTED";
        else if (openSet.has(branch)) action = "KEEP_OPEN_PR";
        else if (worktreeSet.has(branch)) action = "KEEP_WORKTREE";
        else if (merged && ageDays >= retentionDays) action = "DELETE_CANDIDATE_MERGED_EXPIRED";
        else if (merged) action = "KEEP_MERGED_RECENT";
        else if (ageDays < retentionDays) action = "KEEP_UNMERGED_RECENT";
        else if (isBranchContentEquivalent(root, `${remote}/${branch}`, defaultRef)) action = "REVIEW_CONTENT_EQUIVALENT";
        else action = "REVIEW_UNMERGED_EXPIRED";
        return { branch, tip, committedAt, ageDays, merged, action };
      });
    const counts = Object.fromEntries([...new Set(rows.map(row => row.action))].sort().map(action => [action, rows.filter(row => row.action === action).length]));
    const plan = {
      schemaVersion: 1,
      capability: "branch-lifecycle-governor",
      generatedAt: now.toISOString(),
      projectId,
      projectRoot: root,
      remote,
      remoteUrlHash,
      defaultBranch,
      defaultHead,
      policy: { retentionDays },
      protectedBranches: [...protectedSet].sort(),
      openPrBranches: [...openSet].sort(),
      worktreeBranches: [...worktreeSet].sort(),
      counts,
      branches: rows.sort((a, b) => a.branch.localeCompare(b.branch)),
    };
    plan.fingerprint = hash(stablePlanValue(plan));
    return plan;
  }

  apply({ plan, confirmFingerprint }) {
    if (!plan || plan.capability !== "branch-lifecycle-governor") throw new BranchLifecycleGovernorError("INVALID_PLAN");
    if (!confirmFingerprint || confirmFingerprint !== plan.fingerprint || hash(stablePlanValue(plan)) !== plan.fingerprint) {
      throw new BranchLifecycleGovernorError("PLAN_FINGERPRINT_MISMATCH");
    }
    const planAgeMs = this.clock().getTime() - new Date(plan.generatedAt).getTime();
    if (!Number.isFinite(planAgeMs) || planAgeMs < 0 || planAgeMs > this.maxPlanAgeMs) {
      throw new BranchLifecycleGovernorError("PLAN_EXPIRED");
    }
    const root = canonicalRoot(plan.projectRoot);
    const remoteUrlHash = hash(runGit(root, ["remote", "get-url", plan.remote]).stdout);
    if (remoteUrlHash !== plan.remoteUrlHash) throw new BranchLifecycleGovernorError("REMOTE_IDENTITY_CHANGED");
    runGit(root, ["fetch", "--prune", "--no-tags", plan.remote, plan.defaultBranch]);
    const currentDefaultHead = runGit(root, ["rev-parse", "--verify", `${plan.remote}/${plan.defaultBranch}`]).stdout;
    if (currentDefaultHead !== plan.defaultHead) throw new BranchLifecycleGovernorError("DEFAULT_BRANCH_DRIFT");
    const currentWorktrees = parseWorktreeBranches(runGit(root, ["worktree", "list", "--porcelain"]).stdout);
    const candidates = plan.branches.filter(row => row.action === "DELETE_CANDIDATE_MERGED_EXPIRED");
    for (const candidate of candidates) {
      if (currentWorktrees.has(candidate.branch)) throw new BranchLifecycleGovernorError("CANDIDATE_NOW_IN_WORKTREE", candidate.branch);
      const currentTip = runGit(root, ["rev-parse", "--verify", `${plan.remote}/${candidate.branch}`], { allowFailure: true });
      if (!currentTip.ok || currentTip.stdout !== candidate.tip) throw new BranchLifecycleGovernorError("CANDIDATE_TIP_DRIFT", candidate.branch);
      if (!runGit(root, ["merge-base", "--is-ancestor", candidate.tip, currentDefaultHead], { allowFailure: true }).ok) {
        throw new BranchLifecycleGovernorError("CANDIDATE_NO_LONGER_MERGED", candidate.branch);
      }
    }
    if (candidates.length) runGit(root, ["push", "--atomic", plan.remote, "--delete", "--", ...candidates.map(row => row.branch)]);
    return { schemaVersion: 1, capability: plan.capability, projectId: plan.projectId, remote: plan.remote, defaultHead: currentDefaultHead, deleted: candidates.map(row => ({ branch: row.branch, tip: row.tip })) };
  }
}

export const branchLifecycleGovernorStatus = "branch-lifecycle-governor-v1";

