import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { BranchLifecycleGovernor } from "../lib/branch-lifecycle-governor.mjs";

const git = (cwd, ...args) => { const out = spawnSync("git", args, { cwd, encoding: "utf8" }); assert.equal(out.status, 0, out.stderr); return out.stdout.trim(); };

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "branch-governor-"));
  const remote = resolve(root, "remote.git"), repo = resolve(root, "repo");
  git(root, "init", "--bare", remote); await mkdir(repo); git(repo, "init", "-b", "main");
  git(repo, "config", "user.email", "studio@example.test"); git(repo, "config", "user.name", "Studio Test");
  await writeFile(resolve(repo, "README.md"), "base\n"); git(repo, "add", "."); git(repo, "commit", "-m", "base"); git(repo, "remote", "add", "origin", remote); git(repo, "push", "-u", "origin", "main");
  git(repo, "switch", "-c", "codex/merged"); await writeFile(resolve(repo, "merged.txt"), "done\n"); git(repo, "add", "."); git(repo, "commit", "-m", "merged"); git(repo, "push", "-u", "origin", "codex/merged"); git(repo, "switch", "main"); git(repo, "merge", "--ff-only", "codex/merged"); git(repo, "push", "origin", "main");
  git(repo, "switch", "-c", "codex/unmerged"); await writeFile(resolve(repo, "unmerged.txt"), "pending\n"); git(repo, "add", "."); git(repo, "commit", "-m", "pending"); git(repo, "push", "-u", "origin", "codex/unmerged"); git(repo, "switch", "main");
  return { root, repo };
}

test("audit preserves protected/open/worktree branches and only proposes expired merged branches", async () => {
  const { root, repo } = await fixture();
  try {
    git(repo, "worktree", "add", resolve(root, "merged-worktree"), "codex/merged");
    const governor = new BranchLifecycleGovernor({ clock: () => new Date("2030-01-01T00:00:00Z") });
    const plan = governor.audit({ projectId: "demo", projectRoot: repo, retentionDays: 1, openPrBranches: ["codex/unmerged"] });
    assert.equal(plan.branches.find(row => row.branch === "main").action, "KEEP_DEFAULT");
    assert.equal(plan.branches.find(row => row.branch === "codex/merged").action, "KEEP_WORKTREE");
    assert.equal(plan.branches.find(row => row.branch === "codex/unmerged").action, "KEEP_OPEN_PR");
    assert.equal(plan.counts.DELETE_CANDIDATE_MERGED_EXPIRED ?? 0, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("apply deletes an unchanged explicit candidate and rejects a stale plan", async () => {
  const { root, repo } = await fixture();
  try {
    git(repo, "branch", "-d", "codex/merged");
    const governor = new BranchLifecycleGovernor({ clock: () => new Date("2030-01-01T00:00:00Z") });
    const plan = governor.audit({ projectId: "demo", projectRoot: repo, retentionDays: 1 });
    assert.equal(plan.counts.DELETE_CANDIDATE_MERGED_EXPIRED, 1);
    await assert.rejects(async () => governor.apply({ plan, confirmFingerprint: "wrong" }), error => error.code === "PLAN_FINGERPRINT_MISMATCH");
    const result = governor.apply({ plan, confirmFingerprint: plan.fingerprint });
    assert.deepEqual(result.deleted.map(row => row.branch), ["codex/merged"]);
    assert.equal(spawnSync("git", ["-C", repo, "ls-remote", "--heads", "origin", "codex/merged"], { encoding: "utf8" }).stdout.trim(), "");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("apply fails closed when the default branch advances", async () => {
  const { root, repo } = await fixture();
  try {
    git(repo, "branch", "-d", "codex/merged");
    const governor = new BranchLifecycleGovernor({ clock: () => new Date("2030-01-01T00:00:00Z") });
    const plan = governor.audit({ projectId: "demo", projectRoot: repo, retentionDays: 1 });
    await writeFile(resolve(repo, "later.txt"), "later\n"); git(repo, "add", "."); git(repo, "commit", "-m", "later"); git(repo, "push", "origin", "main");
    assert.throws(() => governor.apply({ plan, confirmFingerprint: plan.fingerprint }), error => error.code === "DEFAULT_BRANCH_DRIFT");
    assert.match(await readFile(resolve(repo, "merged.txt"), "utf8"), /done/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

