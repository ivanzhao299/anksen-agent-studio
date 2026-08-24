import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { GitWorkspaceIsolationManager } from "../lib/git-workspace-isolation.mjs";

const run = (cwd, args) => { const out = spawnSync("git", args, { cwd, encoding: "utf8" }); assert.equal(out.status, 0, out.stderr); return out.stdout.trim(); };

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "studio-worktree-")), remote = resolve(root, "remote.git"), repo = resolve(root, "repo");
  await mkdir(repo); run(root, ["init", "--bare", remote]); run(repo, ["init", "-b", "main"]); run(repo, ["config", "user.email", "studio@example.test"]); run(repo, ["config", "user.name", "Studio Test"]);
  await writeFile(resolve(repo, "README.md"), "base\n"); run(repo, ["add", "README.md"]); run(repo, ["commit", "-m", "base"]); run(repo, ["remote", "add", "origin", remote]); run(repo, ["push", "-u", "origin", "main"]);
  return { root, repo, manager: new GitWorkspaceIsolationManager({ stateDir: resolve(root, "state"), worktreeRoot: resolve(root, "worktrees") }) };
}

test("classifies unclaimed source changes as human and executes in an isolated remote-based worktree", async () => {
  const { repo, manager } = await fixture();
  await writeFile(resolve(repo, "README.md"), "human edit\n");
  const result = await manager.createTaskWorkspace({ projectId: "demo", taskId: "task-1", projectRoot: repo, actorId: "agent-1", allowedPaths: ["src"] });
  assert.equal(result.source.clean, false); assert.equal(result.source.changes[0].ownerType, "HUMAN_OR_UNKNOWN");
  assert.equal(run(result.workspace.worktreePath, ["branch", "--show-current"]), "codex/task-1");
  assert.equal(run(result.workspace.worktreePath, ["show", "HEAD:README.md"]), "base");
});

test("fails closed when the source workspace or remote baseline changes", async () => {
  const { repo, manager } = await fixture();
  const result = await manager.createTaskWorkspace({ projectId: "demo", taskId: "task-2", projectRoot: repo });
  await writeFile(resolve(repo, "README.md"), "new human edit\n");
  await assert.rejects(() => manager.verifyTaskWorkspace({ projectId: "demo", taskId: "task-2" }), error => error.code === "SOURCE_WORKSPACE_CHANGED");
  assert.ok(result.workspace.worktreePath.includes("worktrees"));
});

test("records agent ownership only for changes inside its task worktree", async () => {
  const { manager, repo } = await fixture();
  const { workspace } = await manager.createTaskWorkspace({ projectId: "demo", taskId: "task-3", projectRoot: repo });
  await writeFile(resolve(workspace.worktreePath, "agent.txt"), "owned\n");
  assert.deepEqual(await manager.claimChangedPaths({ projectId: "demo", taskId: "task-3", ownerId: "worker-a" }), ["agent.txt"]);
  const registry = await manager.ownership("demo"); assert.equal(registry.claims["agent.txt"].taskId, "task-3");
});

test("attaches an active workspace and its changed-path ownership to a continuation task", async () => {
  const { manager, repo } = await fixture();
  const { workspace } = await manager.createTaskWorkspace({ projectId: "demo", taskId: "task-source", projectRoot: repo });
  await writeFile(resolve(workspace.worktreePath, "agent.txt"), "owned\n");
  await manager.claimChangedPaths({ projectId: "demo", taskId: "task-source", ownerId: "worker-a" });
  const attached = await manager.attachTaskWorkspace({ projectId: "demo", sourceTaskId: "task-source", taskId: "task-continuation" });
  assert.equal(attached.worktreePath, workspace.worktreePath);
  assert.equal(attached.continuationOfTaskId, "task-source");
  assert.equal((await manager.verifyTaskWorkspace({ projectId: "demo", taskId: "task-continuation", allowSourceDrift: true })).workspace.taskId, "task-continuation");
  assert.equal((await manager.ownership("demo")).claims["agent.txt"].taskId, "task-continuation");
});

test("fails closed when origin main advances after worktree creation", async () => {
  const { root, repo, manager } = await fixture();
  const { workspace } = await manager.createTaskWorkspace({ projectId: "demo", taskId: "task-4", projectRoot: repo });
  const peer=resolve(root,"peer");run(root,["clone",resolve(root,"remote.git"),peer]);run(peer,["config","user.email","peer@example.test"]);run(peer,["config","user.name","Peer"]);run(peer,["checkout","main"]);await writeFile(resolve(peer,"remote.txt"),"advance\n");run(peer,["add","remote.txt"]);run(peer,["commit","-m","advance"]);run(peer,["push","origin","main"]);
  await assert.rejects(() => manager.verifyTaskWorkspace({ projectId: "demo", taskId: "task-4" }), error => error.code === "REMOTE_BASELINE_CHANGED");
  assert.ok(workspace.remoteHead);
});

test("fails closed before creating an unbounded number of active worktrees", async () => {
  const { root, repo } = await fixture();
  const manager = new GitWorkspaceIsolationManager({
    stateDir: resolve(root, "state"),
    worktreeRoot: resolve(root, "worktrees"),
    maxActiveWorkspacesPerProject: 1,
  });
  await manager.createTaskWorkspace({ projectId: "demo", taskId: "task-first", projectRoot: repo });
  await assert.rejects(
    () => manager.createTaskWorkspace({ projectId: "demo", taskId: "task-over-limit", projectRoot: repo }),
    error => error.code === "WORKTREE_ACTIVE_LIMIT_EXCEEDED" && error.activeCount === 1 && error.limit === 1,
  );
  assert.equal(run(repo, ["branch", "--list", "codex/task-over-limit"]), "");
});
