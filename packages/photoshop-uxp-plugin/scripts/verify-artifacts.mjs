import { open, stat } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2).filter(argument => argument !== "--");
const [psdArg, pngArg] = args;
if (!psdArg || !pngArg) {
  console.error("Usage: node scripts/verify-artifacts.mjs <poster.psd> <preview.png>");
  process.exit(2);
}

const psdPath = resolve(psdArg);
const pngPath = resolve(pngArg);
const expected = { width: 3780, height: 8504 };

async function readHeader(path, length) {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return buffer;
  } finally {
    await handle.close();
  }
}

const psdHeader = await readHeader(psdPath, 26);
const pngHeader = await readHeader(pngPath, 24);
const psdInfo = await stat(psdPath);
const pngInfo = await stat(pngPath);

const failures = [];
if (psdHeader.toString("ascii", 0, 4) !== "8BPS") failures.push("PSD signature is not 8BPS");
if (psdInfo.size < 1024) failures.push("PSD is unexpectedly small");
if (!pngHeader.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) failures.push("PNG signature is invalid");
const width = pngHeader.readUInt32BE(16);
const height = pngHeader.readUInt32BE(20);
if (width !== expected.width || height !== expected.height) failures.push(`PNG dimensions are ${width}x${height}; expected ${expected.width}x${expected.height}`);

const result = {
  status: failures.length ? "FAIL" : "PASS",
  psd: { path: psdPath, bytes: psdInfo.size, signature: psdHeader.toString("ascii", 0, 4) },
  png: { path: pngPath, bytes: pngInfo.size, width, height },
  expected
};
console.log(JSON.stringify({ ...result, ...(failures.length ? { failures } : {}) }, null, 2));
if (failures.length) process.exit(1);
