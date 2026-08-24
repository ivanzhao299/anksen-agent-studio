import { createHash, randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const hash = value => createHash("sha256").update(String(value)).digest("hex");
const safe = value => String(value ?? "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export class GitWorkspaceIsolationError extends Error {
  constructor(code, message = code, details = {}) { super(message); this.name = "GitWorkspaceIsolationError"; this.code = code; Object.assign(this, details); }
}

function git(root, args, { timeout = 120000 } = {}) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw new GitWorkspaceIsolationError("GIT_COMMAND_FAILED", result.error.message, { args });
  return result;
}

function mustGit(root, args, code) {
  const result = git(root, args);
  if (result.status !== 0) throw new GitWorkspaceIsolationError(code, String(result.stderr || result.stdout || code).trim(), { args });
  return result.stdout.trim();
}

function parseStatus(value) {
  return String(value).split("\n").filter(Boolean).map(line => ({
    index: line[0], worktree: line[1], path: line.slice(3).split(" -> ").at(-1), raw: line
  }));
}

function canonicalRoot(root) {
  const path = realpathSync(resolve(root));
  const top = mustGit(path, ["rev-parse", "--show-toplevel"], "NOT_GIT_REPOSITORY");
  if (realpathSync(resolve(top)) !== path) throw new GitWorkspaceIsolationError("PROJECT_ROOT_MISMATCH");
  return path;
}

function commonDir(root) {
  const value = mustGit(root, ["rev-parse", "--git-common-dir"], "GIT_COMMON_DIR_READ_FAILED");
  return realpathSync(resolve(root, value));
}

function assertSafeWorktreePath(worktreeRoot, worktreePath) {
  const root = resolve(worktreeRoot), target = resolve(worktreePath), rel = relative(root, target);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new GitWorkspaceIsolationError("WORKTREE_PATH_ESCAPE");
  return target;
}

export class GitWorkspaceIsolationManager {
  constructor({ stateDir, worktreeRoot, remote = "origin", clock = () => new Date(), maxActiveWorkspacesPerProject = 3 }) {
    this.stateDir = resolve(stateDir);
    this.worktreeRoot = resolve(worktreeRoot);
    this.remote = remote;
    this.clock = clock;
    this.maxActiveWorkspacesPerProject = maxActiveWorkspacesPerProject;
  }
  ownershipPath(projectId) { return resolve(this.stateDir, `${safe(projectId)}.json`); }
  async ownership(projectId) {
    try { return JSON.parse(await readFile(this.ownershipPath(projectId), "utf8")); }
    catch { return { schemaVersion: 1, projectId, claims: {} }; }
  }
  async saveOwnership(value) {
    await mkdir(dirname(this.ownershipPath(value.projectId)), { recursive: true });
    await writeFile(this.ownershipPath(value.projectId), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
  async inspect({ projectId, projectRoot }) {
    const root = canonicalRoot(projectRoot);
    const branch = mustGit(root, ["branch", "--show-current"], "BRANCH_READ_FAILED") || null;
    const head = mustGit(root, ["rev-parse", "HEAD"], "HEAD_READ_FAILED");
    const status = parseStatus(mustGit(root, ["status", "--porcelain=v1", "--untracked-files=all"], "GIT_STATUS_FAILED"));
    const registry = await this.ownership(projectId);
    const changes = status.map(change => {
      const claim = registry.claims[change.path],ownedHere=claim?.workspacePath===root;
      return { ...change, ownerType: ownedHere ? claim.ownerType : "HUMAN_OR_UNKNOWN", ownerId: ownedHere ? claim.ownerId : null, taskId: ownedHere ? claim.taskId : null, isolatedClaimExists: Boolean(claim&&!ownedHere) };
    });
    const remoteUrl = mustGit(root, ["remote", "get-url", this.remote], "REMOTE_NOT_CONFIGURED");
    const digest = hash(JSON.stringify({ head, branch, status: status.map(item => item.raw) }));
    return { projectId, projectRoot: root, branch, head, remote: this.remote, remoteUrlHash: hash(remoteUrl), clean: changes.length === 0, changes, digest, inspectedAt: this.clock().toISOString() };
  }
  async syncRemote({ projectRoot, defaultBranch = "main", expectedRemoteHead = null }) {
    const root = canonicalRoot(projectRoot);
    const remoteRef = `${this.remote}/${defaultBranch}`;
    try {
      mustGit(root, ["fetch", "--prune", "--no-tags", this.remote, defaultBranch], "REMOTE_FETCH_FAILED");
    } catch (error) {
      if (!expectedRemoteHead) throw error;
      const pinnedLocalRef = mustGit(root, ["rev-parse", "--verify", remoteRef], "REMOTE_BRANCH_MISSING");
      if (pinnedLocalRef !== expectedRemoteHead) throw error;
    }
    const remoteHead = mustGit(root, ["rev-parse", "--verify", remoteRef], "REMOTE_BRANCH_MISSING");
    const localHead = mustGit(root, ["rev-parse", "HEAD"], "HEAD_READ_FAILED");
    const counts = mustGit(root, ["rev-list", "--left-right", "--count", `${localHead}...${remoteHead}`], "REMOTE_DIVERGENCE_CHECK_FAILED").split(/\s+/).map(Number);
    return { remoteRef, remoteHead, localHead, localAhead: counts[0], remoteAhead: counts[1], syncedAt: this.clock().toISOString() };
  }
  async createTaskWorkspace({ projectId, taskId, projectRoot, defaultBranch = "main", actorId = "unknown", allowedPaths = [], baseHead = null }) {
    const registry = await this.ownership(projectId);
    const activeWorkspaces = Object.values(registry.workspaces ?? {}).filter(workspace => workspace.status === "ACTIVE");
    if (activeWorkspaces.length >= this.maxActiveWorkspacesPerProject) {
      throw new GitWorkspaceIsolationError(
        "WORKTREE_ACTIVE_LIMIT_EXCEEDED",
        `Project ${projectId} already has ${activeWorkspaces.length} active workspaces (limit ${this.maxActiveWorkspacesPerProject})`,
        { projectId, activeCount: activeWorkspaces.length, limit: this.maxActiveWorkspacesPerProject },
      );
    }
    const source = await this.inspect({ projectId, projectRoot });
    const remote = await this.syncRemote({ projectRoot: source.projectRoot, defaultBranch });
    const requestedBase = baseHead ? mustGit(source.projectRoot, ["rev-parse", "--verify", `${baseHead}^{commit}`], "WORKSPACE_BASE_MISSING") : remote.remoteHead;
    const branch = `codex/${safe(taskId)}`;
    const worktreePath = assertSafeWorktreePath(this.worktreeRoot, resolve(this.worktreeRoot, safe(projectId), `${safe(taskId)}-${randomUUID().slice(0, 8)}`));
    if (git(source.projectRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]).status === 0) throw new GitWorkspaceIsolationError("TASK_BRANCH_EXISTS");
    await mkdir(dirname(worktreePath), { recursive: true });
    mustGit(source.projectRoot, ["worktree", "add", "-b", branch, worktreePath, requestedBase], "WORKTREE_CREATE_FAILED");
    const sourceCommonDir = commonDir(source.projectRoot), worktreeCommonDir = commonDir(worktreePath);
    if (worktreeCommonDir !== sourceCommonDir) throw new GitWorkspaceIsolationError("WORKTREE_COMMON_DIR_MISMATCH", "Created worktree does not belong to source repository", { sourceCommonDir, worktreeCommonDir });
    const record = { schemaVersion: 1, projectId, taskId, actorId, sourceProjectRoot: source.projectRoot, sourceGitCommonDir: sourceCommonDir, sourceDigest: source.digest, sourceHead: source.head, remoteHead: requestedBase, observedRemoteHead: remote.remoteHead, defaultBranch, branch, worktreePath, allowedPaths: [...allowedPaths], createdAt: this.clock().toISOString(), status: "ACTIVE" };
    registry.workspaces ??= {};
    registry.workspaces[taskId] = record;
    await this.saveOwnership(registry);
    return { source, remote, workspace: record };
  }
  async claimChangedPaths({ projectId, taskId, ownerId }) {
    const registry = await this.ownership(projectId), workspace = registry.workspaces?.[taskId];
    if (!workspace || workspace.status !== "ACTIVE") throw new GitWorkspaceIsolationError("TASK_WORKSPACE_NOT_ACTIVE");
    const status = parseStatus(mustGit(workspace.worktreePath, ["status", "--porcelain=v1", "--untracked-files=all"], "GIT_STATUS_FAILED"));
    for (const item of status) registry.claims[item.path] = { ownerType: "AGENT", ownerId, taskId, branch: workspace.branch, workspacePath:workspace.worktreePath, claimedAt: this.clock().toISOString() };
    await this.saveOwnership(registry);
    return status.map(item => item.path);
  }
  async attachTaskWorkspace({ projectId, sourceTaskId, taskId, actorId = "continuation" }) {
    const registry = await this.ownership(projectId), source = registry.workspaces?.[sourceTaskId];
    if (!source || source.status !== "ACTIVE") throw new GitWorkspaceIsolationError("SOURCE_TASK_WORKSPACE_NOT_ACTIVE");
    if (registry.workspaces?.[taskId]) throw new GitWorkspaceIsolationError("TASK_WORKSPACE_ALREADY_ATTACHED");
    if (!existsSync(source.worktreePath)) throw new GitWorkspaceIsolationError("TASK_WORKTREE_MISSING");
    const attached = { ...source, taskId, actorId, continuationOfTaskId: sourceTaskId, attachedAt: this.clock().toISOString() };
    registry.workspaces ??= {};
    registry.workspaces[taskId] = attached;
    for (const claim of Object.values(registry.claims ?? {})) {
      if (claim.taskId === sourceTaskId && claim.workspacePath === source.worktreePath) claim.taskId = taskId;
    }
    await this.saveOwnership(registry);
    return attached;
  }
  async verifyTaskWorkspace({ projectId, taskId, allowSourceDrift = false }) {
    const registry = await this.ownership(projectId), workspace = registry.workspaces?.[taskId];
    if (!workspace || workspace.status !== "ACTIVE") throw new GitWorkspaceIsolationError("TASK_WORKSPACE_NOT_ACTIVE");
    if (!existsSync(workspace.worktreePath)) throw new GitWorkspaceIsolationError("TASK_WORKTREE_MISSING");
    if (commonDir(workspace.worktreePath) !== commonDir(workspace.sourceProjectRoot)) throw new GitWorkspaceIsolationError("WORKTREE_COMMON_DIR_MISMATCH");
    const branch = mustGit(workspace.worktreePath, ["branch", "--show-current"], "BRANCH_READ_FAILED");
    if (branch !== workspace.branch) throw new GitWorkspaceIsolationError("TASK_BRANCH_CHANGED");
    const source = await this.inspect({ projectId, projectRoot: workspace.sourceProjectRoot });
    if (!allowSourceDrift && source.digest !== workspace.sourceDigest) throw new GitWorkspaceIsolationError("SOURCE_WORKSPACE_CHANGED", "Source workspace changed after task isolation");
    if (allowSourceDrift) return { workspace, source, remote: null };
    const remote = await this.syncRemote({ projectRoot: workspace.sourceProjectRoot, defaultBranch: workspace.defaultBranch, expectedRemoteHead: workspace.remoteHead });
    if (remote.remoteHead !== workspace.remoteHead) throw new GitWorkspaceIsolationError("REMOTE_BASELINE_CHANGED", "Remote branch advanced after task isolation");
    return { workspace, source, remote };
  }
}

export const gitWorkspaceIsolationStatus = "worktree-isolation-v1";
