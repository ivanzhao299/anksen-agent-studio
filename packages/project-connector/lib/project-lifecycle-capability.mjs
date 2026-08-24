import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const git = (root, args) => {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw Object.assign(new Error(String(result.stderr || result.stdout).trim()), { code: "PROJECT_GIT_INSPECTION_FAILED", root, args });
  return result.stdout.trim();
};
const parseWorktrees = value => String(value).split("\n\n").filter(Boolean).map(block => Object.fromEntries(block.split("\n").map(line => {
  const separator = line.indexOf(" "); return separator < 0 ? [line, true] : [line.slice(0, separator), line.slice(separator + 1)];
})));

export class ProjectLifecycleCapability {
  constructor({ registryPath, maxManagedWorktreesPerProject = 3, clock = () => new Date() }) {
    this.registryPath = resolve(registryPath);
    this.maxManagedWorktreesPerProject = maxManagedWorktreesPerProject;
    this.clock = clock;
  }
  async inspect() {
    const registry = JSON.parse(await readFile(this.registryPath, "utf8"));
    const connected = (registry.projects ?? []).filter(project => project.connection_status === "CONNECTED" && project.binding_status !== "detached");
    const seenRoots = new Map(), seenCommonDirs = new Map(), projects = [], violations = [];
    for (const project of connected) {
      const projectId = String(project.project_id ?? "").trim(), configuredPath = String(project.repo_path_display ?? "").trim();
      try {
        if (!projectId || !configuredPath || configuredPath === "not_connected") throw Object.assign(new Error("PROJECT_BINDING_INCOMPLETE"), { code: "PROJECT_BINDING_INCOMPLETE" });
        const root = realpathSync(resolve(configuredPath)), top = realpathSync(git(root, ["rev-parse", "--show-toplevel"]));
        if (root !== top) throw Object.assign(new Error("PROJECT_ROOT_NOT_TOPLEVEL"), { code: "PROJECT_ROOT_NOT_TOPLEVEL" });
        const commonDir = realpathSync(resolve(root, git(root, ["rev-parse", "--git-common-dir"])));
        const worktrees = parseWorktrees(git(root, ["worktree", "list", "--porcelain"]));
        const managedWorktrees = worktrees.filter(item => item.worktree && realpathSync(item.worktree) !== root);
        const duplicateRoot = seenRoots.get(root), duplicateRepository = seenCommonDirs.get(commonDir);
        if (duplicateRoot) violations.push({ code: "DUPLICATE_PROJECT_ROOT", projectId, conflictsWith: duplicateRoot, root });
        if (duplicateRepository && duplicateRepository !== projectId) violations.push({ code: "DUPLICATE_REPOSITORY_BINDING", projectId, conflictsWith: duplicateRepository, commonDir });
        if (managedWorktrees.length > this.maxManagedWorktreesPerProject) violations.push({ code: "WORKTREE_LIMIT_EXCEEDED", projectId, count: managedWorktrees.length, limit: this.maxManagedWorktreesPerProject });
        seenRoots.set(root, projectId); seenCommonDirs.set(commonDir, projectId);
        projects.push({ projectId, path: root, pathRef: `local://${projectId}`, commonDirHash: hash(commonDir), branch: git(root, ["branch", "--show-current"]) || null, head: git(root, ["rev-parse", "HEAD"]), clean: git(root, ["status", "--porcelain=v1", "--untracked-files=all"]) === "", managedWorktreeCount: managedWorktrees.length });
      } catch (error) { violations.push({ code: error?.code ?? "PROJECT_INSPECTION_FAILED", projectId, configuredPath, reason: error instanceof Error ? error.message : String(error) }); }
    }
    const report = { schemaVersion: 1, capability: "project-lifecycle-governance", inspectedAt: this.clock().toISOString(), registryPath: this.registryPath, projectCount: projects.length, projects, violations };
    report.status = violations.length ? "BLOCKED" : "READY"; report.fingerprint = hash({ projects: projects.map(({ projectId, pathRef, commonDirHash }) => ({ projectId, pathRef, commonDirHash })), violations });
    return report;
  }
  async requireReady() {
    const report = await this.inspect();
    if (report.status !== "READY") throw Object.assign(new Error("PROJECT_LIFECYCLE_CAPABILITY_BLOCKED"), { code: "PROJECT_LIFECYCLE_CAPABILITY_BLOCKED", report });
    return report;
  }
}

export const projectLifecycleCapabilityStatus = "project-lifecycle-governance-v1";
