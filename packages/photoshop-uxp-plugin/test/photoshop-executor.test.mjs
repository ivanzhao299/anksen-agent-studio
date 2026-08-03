import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validateJob } = require("../src/job-contract.cjs");
const { createLayout, sampleJob } = require("../src/jinhu-template.cjs");
const { renderPoster } = require("../src/photoshop-executor.cjs");

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

test("renders the governed job inside one modal history operation", async () => {
  const h = harness();
  const job = validateJob(sampleJob());
  const doc = await renderPoster(job, createLayout(job), { approved: true }, { photoshop: h.photoshop });
  assert.equal(doc.id, 42);
  assert.equal(h.calls.filter(call => call[0] === "modal").length, 1);
  assert.equal(h.calls.filter(call => call[0] === "document").length, 1);
  assert.equal(h.calls.filter(call => call[0] === "text").length, 6);
  assert.equal(h.calls.filter(call => call[0] === "group").length, 2);
  assert.deepEqual(h.calls.find(call => call[0] === "text")[1].textColor.rgb, { red: 8, green: 30, blue: 98 });
  assert.equal(h.calls.filter(call => call[0] === "resume").at(-1)[2], true);
});
