import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { assessProductReadiness } from "../lib/product-readiness.mjs";

const model = [{ id: "slice", label: "Slice", evidence: [
  { path: "evidence/implementation.mjs", description: "implementation", patterns: ["implemented", "disabled"] },
  { path: "evidence/verification.test.mjs", description: "verification", patterns: ["verified"] }
] }];

async function fixture(files = {}) {
  const root = await mkdtemp(join(tmpdir(), "anksen-readiness-"));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

test("reports ready when every required repository evidence assertion is present", async () => {
  const root = await fixture({ "evidence/implementation.mjs": "implemented; disabled", "evidence/verification.test.mjs": "verified" });
  const report = await assessProductReadiness({ root, model });
  assert.equal(report.status, "READY");
  assert.deepEqual(report.summary, { ready: 1, total: 1 });
  assert.ok(report.checks[0].evidence.every((item) => item.status === "PRESENT"));
});

test("reports degraded when evidence exists but is incomplete", async () => {
  const root = await fixture({ "evidence/implementation.mjs": "implemented; disabled", "evidence/verification.test.mjs": "not yet" });
  const report = await assessProductReadiness({ root, model });
  assert.equal(report.status, "DEGRADED");
  assert.equal(report.checks[0].status, "DEGRADED");
  assert.deepEqual(report.checks[0].evidence[1].missingPatterns, ["verified"]);
});

test("reports missing without repository evidence", async () => {
  const root = await fixture();
  const report = await assessProductReadiness({ root, model });
  assert.equal(report.status, "MISSING");
  assert.equal(report.checks[0].status, "MISSING");
  assert.ok(report.checks[0].evidence.every((item) => item.status === "MISSING"));
});
