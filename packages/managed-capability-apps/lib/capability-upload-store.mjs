import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";

const MAX_SIZE = 250 * 1024 * 1024;
const CHUNK_SIZE = 512 * 1024;

function safeName(value) {
  const name = basename(String(value ?? ""));
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name) || !/\.(mp4|mov|webm|mp3|wav|jpg|jpeg|png|webp)$/i.test(name)) throw Object.assign(new Error("Unsupported asset name or type"), { code: "CAPABILITY_UPLOAD_NAME_INVALID" });
  return name;
}

function safeUploadId(value) {
  const id = String(value ?? "");
  if (!/^upload-[a-f0-9-]{36}$/.test(id)) throw Object.assign(new Error("Invalid upload id"), { code: "CAPABILITY_UPLOAD_ID_INVALID" });
  return id;
}

export function createCapabilityUploadStore({ repoRoot, center }) {
  const root = resolve(repoRoot, "runtime/workspaces/capability-app-uploads");
  const uploadDir = (id) => { const dir = resolve(root, safeUploadId(id)); if (!dir.startsWith(`${root}${sep}`)) throw new Error("Upload escapes root"); return dir; };
  return {
    async initialize(input, actor = {}) {
      const size = Number(input.size);
      if (!Number.isSafeInteger(size) || size < 1 || size > MAX_SIZE) throw Object.assign(new Error("Asset size must be between 1 byte and 250 MiB"), { code: "CAPABILITY_UPLOAD_SIZE_INVALID" });
      const sha256 = String(input.sha256 ?? "").toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(sha256)) throw Object.assign(new Error("A SHA-256 digest is required"), { code: "CAPABILITY_UPLOAD_DIGEST_INVALID" });
      const record = { version: "1.0", upload_id: `upload-${randomUUID()}`, app_id: String(input.appId), project_id: String(input.projectId), name: safeName(input.name), size, sha256, chunk_size: CHUNK_SIZE, chunk_count: Math.ceil(size / CHUNK_SIZE), created_at: new Date().toISOString(), actor_user_id: actor.userId ?? null, status: "UPLOADING" };
      const dir = uploadDir(record.upload_id); await mkdir(resolve(dir, "chunks"), { recursive: true }); await writeFile(resolve(dir, "upload.json"), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
      return record;
    },
    async putChunk(uploadId, index, bytes) {
      const dir = uploadDir(uploadId), record = JSON.parse(await readFile(resolve(dir, "upload.json"), "utf8")), chunkIndex = Number(index);
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= record.chunk_count) throw Object.assign(new Error("Invalid chunk index"), { code: "CAPABILITY_UPLOAD_CHUNK_INVALID" });
      if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > record.chunk_size) throw Object.assign(new Error("Invalid chunk size"), { code: "CAPABILITY_UPLOAD_CHUNK_INVALID" });
      const expected = chunkIndex === record.chunk_count - 1 ? record.size - chunkIndex * record.chunk_size : record.chunk_size;
      if (bytes.length !== expected) throw Object.assign(new Error(`Chunk ${chunkIndex} must contain ${expected} bytes`), { code: "CAPABILITY_UPLOAD_CHUNK_INVALID" });
      await writeFile(resolve(dir, "chunks", String(chunkIndex).padStart(8, "0")), bytes, { mode: 0o600 });
      return { upload_id: uploadId, chunk_index: chunkIndex, received: bytes.length };
    },
    async complete(uploadId) {
      const dir = uploadDir(uploadId), recordPath = resolve(dir, "upload.json"), record = JSON.parse(await readFile(recordPath, "utf8")), chunksDir = resolve(dir, "chunks");
      const chunks = (await readdir(chunksDir)).sort();
      if (chunks.length !== record.chunk_count) throw Object.assign(new Error(`Expected ${record.chunk_count} chunks, received ${chunks.length}`), { code: "CAPABILITY_UPLOAD_INCOMPLETE" });
      const assembled = resolve(dir, record.name), hash = createHash("sha256"), output = createWriteStream(assembled, { mode: 0o600 });
      for (const name of chunks) await new Promise((accept, reject) => { const input = createReadStream(resolve(chunksDir, name)); input.on("data", (chunk) => hash.update(chunk)); input.on("error", reject); output.on("error", reject); input.on("end", accept); input.pipe(output, { end: false }); });
      await new Promise((accept, reject) => { output.end(accept); output.on("error", reject); });
      const info = await stat(assembled), digest = hash.digest("hex");
      if (info.size !== record.size || digest !== record.sha256) throw Object.assign(new Error("Completed upload failed size or SHA-256 verification"), { code: "CAPABILITY_UPLOAD_VERIFICATION_FAILED" });
      const accepted = await center.stageAsset(record.app_id, record.project_id, assembled, record.name);
      const completed = { ...record, status: "COMPLETE", completed_at: new Date().toISOString(), accepted };
      await writeFile(recordPath, `${JSON.stringify(completed, null, 2)}\n`, { mode: 0o600 });
      await rm(chunksDir, { recursive: true, force: true });
      return completed;
    }
  };
}
