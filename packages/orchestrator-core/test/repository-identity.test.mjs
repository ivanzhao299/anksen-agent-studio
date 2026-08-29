import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { assertRepositoryIdentity, inspectRepositoryIdentity } from "../lib/repository-identity.mjs";

const realRepoRoot = resolve(new URL("../../..", import.meta.url).pathname);

function fixture({ remote = "https://github.com/ivanzhao299/anksen-agent-studio.git", packageName = "anksen-agent-studio" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "studio-identity-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["remote", "add", "origin", remote], { cwd: root });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: packageName }));
  writeFileSync(join(root, "studio-project.json"), JSON.stringify({
    schema_version: "1.0",
    project_id: "anksen-agent-studio",
    package_name: "anksen-agent-studio",
    canonical_remote: "https://github.com/ivanzhao299/anksen-agent-studio.git"
  }));
  return root;
}

test("accepts the canonical Studio checkout", () => {
  const result = inspectRepositoryIdentity(realRepoRoot);
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.checks, { git_root: true, remote: true, project_id: true });
});

test("rejects a Studio-shaped directory nested inside another repository", () => {
  const outer = fixture();
  const nested = join(outer, "anksen-agent-studio");
  mkdirSync(nested);
  writeFileSync(join(nested, "package.json"), JSON.stringify({ name: "anksen-agent-studio" }));
  writeFileSync(join(nested, "studio-project.json"), JSON.stringify({
    schema_version: "1.0",
    project_id: "anksen-agent-studio",
    package_name: "anksen-agent-studio",
    canonical_remote: "https://github.com/ivanzhao299/anksen-agent-studio.git"
  }));
  assert.throws(() => assertRepositoryIdentity(nested), /STUDIO_REPOSITORY_IDENTITY_BLOCKED/);
});

test("rejects a remote or project identifier mismatch", () => {
  assert.equal(inspectRepositoryIdentity(fixture({ remote: "https://github.com/ivanzhao299/jinhu-smart-park.git" })).checks.remote, false);
  assert.equal(inspectRepositoryIdentity(fixture({ packageName: "jinhu-smart-park" })).checks.project_id, false);
});
