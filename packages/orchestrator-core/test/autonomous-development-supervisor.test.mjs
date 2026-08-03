import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("resident supervisor retains bounded restart, preflight and crash-loop evidence",async()=>{
  const source=await readFile(new URL("../bin/autonomous-development-worker-supervisor.mjs",import.meta.url),"utf8");
  for(const evidence of ["ensurePostgresFixture","login\", \"status","restarts.length > 3","CRASH_LOOP","PREFLIGHT_FAILED","1000 * (2 **"])assert.match(source,new RegExp(evidence.replace(/[()*+]/g,"\\$&")));
});

test("user service definition is restart-on-failure and does not authorize release",async()=>{
  const source=await readFile(new URL("../bin/autonomous-development-worker-service.mjs",import.meta.url),"utf8");
  for(const evidence of ["KeepAlive","SuccessfulExit","ThrottleInterval","loaded:false"])assert.match(source,new RegExp(evidence));
  assert.doesNotMatch(source,/git push|git merge|deploy/);
});
