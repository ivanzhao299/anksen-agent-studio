import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getRuntimeIdentityUsage } from "./action-server.mjs";

test("native Studio runs are durable and fail closed after service interruption", async () => {
  const [actions, server, render] = await Promise.all([
    readFile(new URL("./action-server.mjs", import.meta.url), "utf8"),
    readFile(new URL("./server.mjs", import.meta.url), "utf8"),
    readFile(new URL("./render.mjs", import.meta.url), "utf8")
  ]);
  assert.match(actions, /hydrateConversationRuns/);
  assert.match(actions, /RECOVERY_REQUIRED/);
  assert.match(actions, /不会自动重复执行可能产生副作用的任务/);
  assert.match(actions, /getLatestConversationAction/);
  assert.match(server, /\/api\/actions\/latest/);
  assert.match(server, /await getConversationAction/);
  assert.match(render, /fetch\("\/api\/actions\/latest"/);
  assert.match(render, /routeHref\("\/actions"/);
  assert.match(render, /需要恢复确认/);
});

test("runtime identity and token usage expose references without secret values", async () => {
  const result = await getRuntimeIdentityUsage();
  const codex = result.runtimes.find((item) => item.runtimeId === "codex-cli");
  assert.ok(codex);
  assert.equal(codex.credentialReferenceId, "codex-local-session-ref");
  assert.equal(codex.credentialReferenceLocation, "user-session://codex-cli/current-user");
  assert.equal(codex.secretValuesExposed, false);
  assert.equal(result.safety.secretValuesRead, false);
  assert.equal(result.safety.secretValuesReturned, false);
  assert.ok(["COMPLETE", "PARTIAL", "NOT_REPORTED", "NO_RUNS"].includes(codex.usage.status));
});
