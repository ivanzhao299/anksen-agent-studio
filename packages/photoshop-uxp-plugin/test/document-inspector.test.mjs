import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { findLayer, flattenLayerTree, inspectDocument } = require("../src/document-inspector.cjs");

function fixture() {
  const title = { id: 2, name: "10_TITLE", kind: "text", visible: true, opacity: 100, bounds: { left: 100, top: 120, right: 900, bottom: 260 }, textItem: { contents: "金湖科创产业园", characterStyle: { fontName: "Source Han Sans SC", size: 72, horizontalScale: 100, verticalScale: 100 } } };
  const group = { id: 1, name: "02_COPY", kind: "group", visible: true, layers: [title] };
  return { doc: { id: 9, name: "poster.psd", width: 3780, height: 8504, resolution: 150, mode: "RGBColorMode", colorProfileName: "sRGB IEC61966-2.1", saved: true, layers: [group] }, title };
}

test("inspects a semantic layer tree with editable capabilities", () => {
  const { doc } = fixture();
  const inspection = inspectDocument(doc);
  assert.equal(inspection.document.layerCount, 2);
  const title = flattenLayerTree(inspection.layers)[1];
  assert.equal(title.type, "TEXT");
  assert.equal(title.text.fontSize, 72);
  assert.ok(title.supportedOperations.includes("REPLACE_TEXT"));
});

test("finds nested layers by stable id or exact name", () => {
  const { doc, title } = fixture();
  assert.equal(findLayer(doc, { layerId: 2 }), title);
  assert.equal(findLayer(doc, { layerName: "10_TITLE" }), title);
});

test("fails closed when a layer name is duplicated", () => {
  const doc = { layers: [{ id: 1, name: "Duplicate", layers: [] }, { id: 2, name: "Duplicate", layers: [] }] };
  assert.throws(() => findLayer(doc, { layerName: "Duplicate" }), /ambiguous/);
});
