import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { StudioClient } = require("../src/studio-client.cjs");

test("rejects non-HTTPS Studio endpoints", async () => {
  const client = new StudioClient({ baseUrl: "http://localhost:3000", fetch: async () => ({ ok: true, status: 204 }) });
  await assert.rejects(() => client.getApprovedJob("job-1"), /HTTPS/);
});

test("uses credential references without credential values", async () => {
  let request;
  const client = new StudioClient({
    baseUrl: "https://studio.anksen.example",
    credentialReferenceId: "photoshop-session-ref",
    fetch: async (url, init) => {
      request = { url, init };
      return { ok: true, status: 200, json: async () => ({ jobId: "job-1" }) };
    }
  });
  await client.getApprovedJob("job-1");
  assert.equal(request.init.headers["x-credential-reference"], "photoshop-session-ref");
  assert.equal(Object.keys(request.init.headers).some(key => /token|secret|password/i.test(key)), false);
});
