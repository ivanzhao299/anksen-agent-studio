import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { runPreflight } = require("../src/preflight-review.cjs");

function inspection(textOverrides = {}) {
  return { document: { width: 3780, height: 8504, resolution: 150, colorMode: "RGB", profile: "sRGB" }, layers: [{ id: 1, name: "10_TITLE", type: "TEXT", visible: true, bounds: { left: 240, top: 400, right: 3500, bottom: 700 }, text: { contents: "金湖科创产业园", font: "Source Han Sans SC", fontSize: 72, horizontalScale: 100, verticalScale: 100, missingFont: false, ...textOverrides }, children: [] }] };
}

const job = { document: { widthPx: 3780, heightPx: 8504, resolution: 150, colorMode: "RGB", safeMarginPx: 180 }, reviewCriteria: { minimumFontSizePt: 18 } };

test("allows technically compliant artwork while preserving human visual review", () => {
  const result = runPreflight(inspection(), job);
  assert.equal(result.disposition, "READY");
  assert.equal(result.exportAllowed, true);
  assert.match(result.note, /不替代人工视觉审查/);
});

test("blocks distorted text and reports the exact evidence", () => {
  const result = runPreflight(inspection({ horizontalScale: 82 }), job);
  assert.equal(result.disposition, "BLOCKED");
  assert.equal(result.exportAllowed, false);
  assert.equal(result.issues[0].code, "TEXT_DISTORTED");
});

test("reports text content used as a layer name when semantic names are required", () => {
  const value = inspection();
  value.layers[0].name = value.layers[0].text.contents;
  const result = runPreflight(value, { ...job, reviewCriteria: { ...job.reviewCriteria, requireSemanticLayerNames: true } });
  assert.ok(result.issues.some(item => item.code === "TEXT_CONTENT_USED_AS_LAYER_NAME"));
});

test("derives pixel dimensions from physical millimetres and blocks a 1x1 document", () => {
  const inspection = { document: { width: 1, height: 1, resolution: 150, colorMode: "CMYK", profile: "FOGRA39" }, layers: [{ id: 1, name: "00_BACKGROUND", type: "PIXEL", visible: true, children: [] }] };
  const result = runPreflight(inspection, { document: { widthMm: 640, heightMm: 1440, resolution: 150, colorMode: "CMYK", bleedMm: 0 } });
  assert.equal(result.disposition, "BLOCKED");
  assert.ok(result.issues.some(item => item.code === "DOCUMENT_WIDTH_MISMATCH"));
});

test("blocks unverifiable requested bleed", () => {
  const inspection = { document: { width: 3780, height: 8504, resolution: 150, colorMode: "CMYK", profile: "FOGRA39" }, layers: [{ id: 1, name: "00_BACKGROUND", type: "PIXEL", visible: true, children: [] }] };
  const result = runPreflight(inspection, { document: { widthMm: 640, heightMm: 1440, resolution: 150, colorMode: "CMYK", bleedMm: 3 } });
  assert.equal(result.exportAllowed, false);
  assert.ok(result.issues.some(item => item.code === "BLEED_UNVERIFIED"));
});
