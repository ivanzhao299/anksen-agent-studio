import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const composePath = new URL("../infrastructure/gitea/docker-compose.yml", import.meta.url);
const runnerPath = new URL("../infrastructure/gitea/runner-config.yaml", import.meta.url);
const deployPath = new URL("./deploy-gitea.sh", import.meta.url);
const jumpPath = new URL("../infrastructure/deployment/aliyun-studio-jump-deploy.sh", import.meta.url);

test("Gitea production images are explicit and digest pinned", async () => {
  const source = await readFile(composePath, "utf8");
  const images = [...source.matchAll(/^\s+image:\s+(.+)$/gm)].map((match) => match[1]);
  assert.equal(images.length, 3);
  for (const image of images) {
    assert.match(image, /:[A-Za-z0-9_.-]+@sha256:[a-f0-9]{64}$/);
    assert.doesNotMatch(image, /:latest(?:@|$)/);
  }
});

test("Runner uses isolated DinD and never mounts the host Docker socket", async () => {
  const [compose, runner] = await Promise.all([
    readFile(composePath, "utf8"),
    readFile(runnerPath, "utf8")
  ]);
  assert.match(compose, /runner:2-dind-rootless@sha256:/);
  assert.doesNotMatch(compose, /\/var\/run\/docker\.sock/);
  assert.match(runner, /valid_volumes:\s*\[\]/);
  assert.match(runner, /privileged:\s*false/);
  assert.match(runner, /capacity:\s*1/);
});

test("Database is internal and only Gitea loopback HTTP plus LAN SSH are published", async () => {
  const source = await readFile(composePath, "utf8");
  const databaseBlock = source.slice(source.indexOf("  database:"), source.indexOf("  server:"));
  assert.doesNotMatch(databaseBlock, /ports:/);
  assert.match(source, /127\.0\.0\.1:\$\{GITEA_HTTP_PORT/);
  assert.match(source, /\$\{GITEA_SSH_BIND_ADDRESS/);
});

test("Deployment is exact-SHA, immutable-release and fail-closed", async () => {
  const source = await readFile(deployPath, "utf8");
  for (const expected of [
    "expected_commit",
    "origin/main",
    "+refs/heads/main:refs/remotes/origin/main",
    "worktree add --detach",
    "status --porcelain",
    "gitea-doctor.sh",
    "flock -n"
  ]) assert.ok(source.includes(expected), `missing deployment gate: ${expected}`);
  assert.doesNotMatch(source, /reset\s+--hard|clean\s+-[a-z]*f/i);
});

test("Jump boundary exposes only bounded Gitea operations", async () => {
  const source = await readFile(jumpPath, "utf8");
  assert.match(source, /"gitea" && "\$argument" == "deploy"/);
  assert.match(source, /"gitea" && "\$argument" == "probe"/);
  assert.match(source, /"gitea" && "\$argument" == "create-admin"/);
  assert.match(source, /"gitea" && "\$argument" == "backup"/);
  assert.equal(
    (source.match(/readlink -f \/opt\/anksen\/gitea-control\/current/g) ?? []).length,
    3,
    "probe, create-admin and backup must resolve the immutable release path"
  );
  assert.match(source, /\[0-9a-f\]\{40\}/);
});
