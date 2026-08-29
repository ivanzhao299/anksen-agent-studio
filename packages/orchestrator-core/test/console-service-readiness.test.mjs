import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Console service verifies a listener before reporting launchd readiness", async () => {
  const source = await readFile(new URL("../bin/studio.mjs", import.meta.url), "utf8");
  assert.match(source, /async function waitForConsoleListener/);
  assert.match(source, /const launchdReady = launchdPids\.length > 0/);
  assert.match(source, /launchd_listener:/);
  assert.match(source, /if \(!launchdReady\) await runOptional\("launchctl", \["bootout"/);
  assert.match(source, /const manualFallback = !launchdReady/);
});
