import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
