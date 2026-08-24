import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { ProjectLifecycleCapability } from "../lib/project-lifecycle-capability.mjs";

const git = (root, ...args) => { const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" }); assert.equal(result.status, 0, result.stderr); };
test("builds a dynamic worker project inventory from the authoritative registry", async () => {
  const root = await mkdtemp(join(tmpdir(), "project-capability-")), repo = join(root, "repo"), registry = join(root, "registry.json");
  try {
    await import("node:fs/promises").then(({ mkdir }) => mkdir(repo)); git(repo, "init", "-b", "main"); git(repo, "config", "user.email", "test@example.com"); git(repo, "config", "user.name", "Test"); await writeFile(join(repo, "README.md"), "ok\n"); git(repo, "add", "."); git(repo, "commit", "-m", "init");
    await writeFile(registry, JSON.stringify({ projects: [{ project_id: "one", binding_status: "attached", connection_status: "CONNECTED", repo_path_display: repo }] }));
    const report = await new ProjectLifecycleCapability({ registryPath: registry }).requireReady();
    assert.equal(report.status, "READY"); assert.equal(report.projects[0].projectId, "one"); assert.equal(report.projects[0].pathRef, "local://one"); assert.ok(report.fingerprint);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("fails closed when two project ids bind the same repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "project-capability-")), repo = join(root, "repo"), registry = join(root, "registry.json");
  try {
    await import("node:fs/promises").then(({ mkdir }) => mkdir(repo)); git(repo, "init", "-b", "main"); git(repo, "config", "user.email", "test@example.com"); git(repo, "config", "user.name", "Test"); await writeFile(join(repo, "README.md"), "ok\n"); git(repo, "add", "."); git(repo, "commit", "-m", "init");
    await writeFile(registry, JSON.stringify({ projects: ["one", "two"].map(project_id => ({ project_id, binding_status: "attached", connection_status: "CONNECTED", repo_path_display: repo })) }));
    const report = await new ProjectLifecycleCapability({ registryPath: registry }).inspect();
    assert.equal(report.status, "BLOCKED"); assert.ok(report.violations.some(item => item.code === "DUPLICATE_PROJECT_ROOT"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
