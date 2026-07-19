import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AutonomousExecutionCenter } from "../lib/autonomous-execution-center.mjs";

test("AEC exposes one orchestration facade over the existing persistent kernel", async () => {
  assert.deepEqual(
    Object.getOwnPropertyNames(AutonomousExecutionCenter.prototype),
    ["constructor", "createGoal", "getDashboard", "getGoal", "getTaskGraph", "getSession", "getMorningReport", "getReadiness", "withPool", "dashboard"],
  );
  const source = await readFile(
    new URL("../lib/autonomous-execution-center.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /new PersistentNightShiftService\(pool\)/);
  assert.match(source, /new SessionProjectionConsumer/);
  assert.doesNotMatch(source, /CREATE TABLE/i);
  assert.doesNotMatch(source, /CodexCliAdapter|runtimeType:\s*["']CODEX/);
});

test("console exposes the authenticated AEC API and chairman view", async () => {
  const [server, render] = await Promise.all([
    readFile(
      new URL("../../../apps/console/web/server.mjs", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../../apps/console/web/render.mjs", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(server, /\/api\/aec\/goals/);
  assert.match(server, /\/api\/v1\/goals/);
  assert.match(server, /evaluateConsoleActionAccess\([^)]*"aec-goal"/s);
  assert.match(render, /New Goal/);
  assert.match(render, /完善 Runtime 文档/);
  assert.match(render, /Morning Report/);
  assert.match(render, /CONTROLLED_STUB/);
});
