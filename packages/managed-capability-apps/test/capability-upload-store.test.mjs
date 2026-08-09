import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCapabilityUploadStore } from "../lib/capability-upload-store.mjs";

test("chunked upload verifies digest before staging into the managed app", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "capability-upload-"));
  const staged = [];
  const center = { async stageAsset(appId, projectId, path, name) { staged.push({ appId, projectId, path, name, bytes: await readFile(path) }); return { ok: true }; } };
  const store = createCapabilityUploadStore({ repoRoot, center });
  const bytes = Buffer.alloc(700_000, 7), sha256 = createHash("sha256").update(bytes).digest("hex");
  const upload = await store.initialize({ appId: "openmontage", projectId: "jinhu-trade-center-film-v1", name: "origin.mp4", size: bytes.length, sha256 });
  for (let index = 0; index < upload.chunk_count; index++) await store.putChunk(upload.upload_id, index, bytes.subarray(index * upload.chunk_size, Math.min(bytes.length, (index + 1) * upload.chunk_size)));
  const completed = await store.complete(upload.upload_id);
  assert.equal(completed.status, "COMPLETE");
  assert.deepEqual(staged[0].bytes, bytes);
  assert.equal(staged[0].name, "origin.mp4");
});

test("upload initialization rejects unverified media", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "capability-upload-"));
  const store = createCapabilityUploadStore({ repoRoot, center: {} });
  await assert.rejects(() => store.initialize({ appId: "openmontage", projectId: "p1", name: "../escape.mp4", size: 5, sha256: "bad" }), /SHA-256/);
});
