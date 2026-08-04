import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validateJob } = require("../src/job-contract.cjs");
const { createLayout, sampleJob } = require("../src/jinhu-template.cjs");
const { applyOperation, executeOperationPlan, renderPoster, selectLayer } = require("../src/photoshop-executor.cjs");

function harness() {
  const calls = [];
  const doc = {
    id: 42,
    activeLayers: [{ name: "" }],
    async createTextLayer(options) { calls.push(["text", options]); return { name: options.name }; },
    async createLayerGroup(options) { calls.push(["group", options]); return { name: options.name }; }
  };
  class SolidColor {
    constructor() { this.rgb = { red: 255, green: 255, blue: 255 }; }
  }
  const photoshop = {
    app: { SolidColor, async createDocument(options) { calls.push(["document", options]); return doc; } },
    constants: { NewDocumentMode: { RGB: "RGB", CMYK: "CMYK" }, DocumentFill: { WHITE: "WHITE" } },
    action: { async batchPlay(descriptors) { calls.push(["batchPlay", descriptors]); } },
    core: {
      async executeAsModal(callback, options) {
        calls.push(["modal", options]);
        return callback({ hostControl: {
          async suspendHistory(options2) { calls.push(["suspend", options2]); return "history-1"; },
          async resumeHistory(id, commit) { calls.push(["resume", id, commit]); }
        } });
      }
    }
  };
  return { calls, doc, photoshop };
}

test("refuses document writes without user confirmation", async () => {
  const h = harness();
  const job = validateJob(sampleJob());
  await assert.rejects(() => renderPoster(job, createLayout(job), { approved: false }, { photoshop: h.photoshop }), /approval/);
  assert.equal(h.calls.length, 0);
});

function operationHarness() {
  const calls = [];
  const textLayer = { id: 7, name: "10_TITLE", kind: "text", visible: true, opacity: 100, bounds: { left: 10, top: 10, right: 100, bottom: 50 }, textItem: { contents: "旧标题", characterStyle: { size: 48, horizontalScale: 100, verticalScale: 100 } }, async translate(x, y) { calls.push(["translate", x, y]); } };
  const doc = { id: 42, name: "poster.psd", width: 1000, height: 2000, resolution: 150, mode: "RGB", layers: [textLayer] };
  class SolidColor { constructor() { this.rgb = {}; } }
  const photoshop = {
    app: { SolidColor }, action: { async batchPlay(value) { calls.push(["batchPlay", value]); } }, constants: { AnchorPosition: { MIDDLECENTER: "center" } },
    core: { async executeAsModal(callback) { return callback({ isCancelled: false, reportProgress(value) { calls.push(["progress", value]); }, hostControl: { async suspendHistory() { calls.push(["suspend"]); return "history"; }, async resumeHistory(id, commit) { calls.push(["resume", id, commit]); } } }); } }
  };
  return { calls, doc, photoshop, textLayer };
}

test("executes a V2 operation plan in one committed history step", async () => {
  const h = operationHarness();
  const result = await executeOperationPlan(h.doc, [{ operationId: "title", operation: "REPLACE_TEXT", target: { layerId: 7 }, parameters: { text: "金湖科创产业园" } }], { approved: true }, { photoshop: h.photoshop });
  assert.equal(h.textLayer.textItem.contents, "金湖科创产业园");
  assert.equal(result.results[0].status, "COMPLETED");
  assert.equal(h.calls.find(call => call[0] === "resume")[2], true);
});

test("rolls the history suspension back when a later operation fails", async () => {
  const h = operationHarness();
  await assert.rejects(() => executeOperationPlan(h.doc, [
    { operationId: "rename", operation: "RENAME_LAYER", target: { layerId: 7 }, parameters: { name: "RENAMED" } },
    { operationId: "missing", operation: "MOVE_LAYER", target: { layerId: 99 }, parameters: { deltaX: 1, deltaY: 1 } }
  ], { approved: true }, { photoshop: h.photoshop }), /missing/);
  assert.equal(h.calls.find(call => call[0] === "resume")[2], false);
});

test("skips completed idempotency keys without applying the write again", async () => {
  const h = operationHarness();
  const result = await executeOperationPlan(h.doc, [{ operationId: "title", idempotencyKey: "title-v1", operation: "REPLACE_TEXT", target: { layerId: 7 }, parameters: { text: "不会写入" } }], { approved: true, completedIdempotencyKeys: new Set(["title-v1"]) }, { photoshop: h.photoshop });
  assert.equal(h.textLayer.textItem.contents, "旧标题");
  assert.equal(result.results[0].status, "SKIPPED_IDEMPOTENT");
});

test("never skips save or export operations when an idempotency key was completed", async () => {
  const h = operationHarness();
  const output = { name: "proof.png" };
  h.doc.saveAs = {};
  h.doc.saveAs.png = async entry => { h.savedEntry = entry; };
  const result = await executeOperationPlan(h.doc, [{
    operationId: "proof",
    idempotencyKey: "proof-v1",
    operation: "EXPORT_DOCUMENT",
    parameters: { format: "png", suggestedName: "proof.png" }
  }], {
    approved: true,
    completedIdempotencyKeys: new Set(["proof-v1"]),
    outputEntries: { proof: output },
    preflightBeforeOutput: async () => ({ disposition: "READY", exportAllowed: true })
  }, { photoshop: h.photoshop });
  assert.equal(result.results[0].status, "COMPLETED");
  assert.equal(h.savedEntry, output);
});

test("blocks output before writing when technical preflight has a blocker", async () => {
  const h = operationHarness();
  const output = { name: "blocked.png" };
  h.doc.saveAs = { async png() { h.savedEntry = output; } };
  await assert.rejects(() => executeOperationPlan(h.doc, [{ operationId: "blocked", operation: "EXPORT_DOCUMENT", parameters: { format: "png" } }], {
    approved: true,
    outputEntries: { blocked: output },
    preflightBeforeOutput: async () => ({ disposition: "BLOCKED", exportAllowed: false })
  }, { photoshop: h.photoshop }), /PREFLIGHT_BLOCKED_OUTPUT/);
  assert.equal(h.savedEntry, undefined);
});

test("renders the governed job inside one modal history operation", async () => {
  const h = harness();
  const job = validateJob(sampleJob());
  const doc = await renderPoster(job, createLayout(job), { approved: true }, { photoshop: h.photoshop });
  assert.equal(doc.id, 42);
  assert.equal(h.calls.filter(call => call[0] === "modal").length, 1);
  assert.equal(h.calls.filter(call => call[0] === "document").length, 1);
  assert.equal(h.calls.filter(call => call[0] === "text").length, 6);
  assert.equal(h.calls.filter(call => call[0] === "group").length, 2);
  assert.deepEqual(h.calls.find(call => call[0] === "text")[1].textColor.rgb, { red: 10, green: 32, blue: 71 });
  assert.equal(h.calls.filter(call => call[0] === "resume").at(-1)[2], true);
});

test("creates a document and resolves created layer outputs for later commands", async () => {
  const calls = [];
  const createdLayer = { id: 88, name: "", kind: "text", visible: true, opacity: 100, bounds: { left: 100, top: 100, right: 500, bottom: 200 }, textItem: { contents: "", characterStyle: { size: 80, horizontalScale: 100, verticalScale: 100 }, paragraphStyle: {} } };
  const doc = {
    id: 77, name: "dynamic.psd", width: 1200, height: 1800, resolution: 150, mode: "RGB", layers: [], activeLayers: [],
    async createTextLayer(options) { calls.push(["createTextLayer", options]); Object.assign(createdLayer, { name: options.name }); createdLayer.textItem.contents = options.contents; this.layers.push(createdLayer); this.activeLayers = [createdLayer]; return createdLayer; }
  };
  class SolidColor { constructor() { this.rgb = {}; } }
  const photoshop = {
    app: { SolidColor, async createDocument(options) { calls.push(["createDocument", options]); return doc; } },
    constants: { NewDocumentMode: { RGB: "RGB", CMYK: "CMYK" }, DocumentFill: { TRANSPARENT: "TRANSPARENT", WHITE: "WHITE" }, AnchorPosition: { MIDDLECENTER: "center" } },
    action: { async batchPlay(descriptors) { calls.push(["batchPlay", descriptors]); } },
    core: { async executeAsModal(callback) { return callback({ isCancelled: false, reportProgress() {}, hostControl: { async suspendHistory() { return "h"; }, async resumeHistory() {} } }); } }
  };
  const result = await executeOperationPlan(null, [
    { operationId: "title", operation: "CREATE_TEXT_LAYER", parameters: { name: "10_TITLE", text: "Capability Graph", position: { x: 100, y: 200 }, fontSize: 80, color: { red: 10, green: 20, blue: 30 } } },
    { operationId: "style", operation: "SET_TEXT_STYLE", target: { nodeOutput: "title" }, parameters: { tracking: 120, fauxBold: true } }
  ], { approved: true, createDocument: { width: 1200, height: 1800, resolution: 150, colorMode: "RGB", name: "Dynamic" } }, { photoshop });
  assert.equal(result.document.id, 77);
  assert.equal(createdLayer.name, "10_TITLE");
  assert.equal(createdLayer.textItem.characterStyle.tracking, 120);
  assert.equal(createdLayer.textItem.characterStyle.fauxBold, true);
  assert.equal(calls.filter(call => call[0] === "createDocument").length, 1);
});

test("selects a target-sensitive layer by stable Photoshop id", async () => {
  const wrongLayer = { id: 1, name: "wrong" };
  const targetLayer = { id: 22, name: "hero" };
  const doc = { activeLayers: [wrongLayer] };
  const descriptors = [];
  const action = { async batchPlay(value) { descriptors.push(...value); doc.activeLayers = [targetLayer]; } };
  await selectLayer(doc, targetLayer, action);
  assert.equal(descriptors[0]._obj, "select");
  assert.equal(descriptors[0]._target[0]._id, 22);
});

test("round-trips a selection through the typed Photoshop work-path DOM", async () => {
  const calls = [];
  const path = { async makeSelection(feather, antialias, mode) { calls.push(["makeSelection", feather, antialias, mode]); } };
  const doc = {
    selection: { async makeWorkPath(tolerance) { calls.push(["makeWorkPath", tolerance]); return path; } },
    pathItems: { getByName(name) { calls.push(["getByName", name]); return path; } }
  };
  const photoshop = {
    app: {},
    action: {},
    constants: { SelectionType: { REPLACE: "replace" } }
  };
  await applyOperation(doc, { operation: "CREATE_WORK_PATH_FROM_SELECTION", parameters: { tolerance: 2 } }, {}, { photoshop });
  await applyOperation(doc, { operation: "LOAD_WORK_PATH_AS_SELECTION", parameters: { feather: 0, antialias: true } }, {}, { photoshop });
  assert.deepEqual(calls, [
    ["makeWorkPath", 2],
    ["getByName", "Work Path"],
    ["makeSelection", 0, true, "replace"]
  ]);
});
