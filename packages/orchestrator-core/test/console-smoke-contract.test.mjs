import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");

test("console smoke recognizes the current mission canvas contract", () => {
  const result = spawnSync(
    process.execPath,
    ["packages/orchestrator-core/bin/studio.mjs", "console", "smoke", "--dry-run"],
    { cwd: repoRoot, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /status: PASS/);
  assert.match(result.stdout, /interactive_controls: yes/);
  assert.match(result.stdout, /autonomous_workstation: yes/);
});
