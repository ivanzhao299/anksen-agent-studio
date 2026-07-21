import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CadAgentSdk, CadError, loadCadDocument } from "../lib/index.mjs";

const fixture = new URL("../fixtures/minimal.dxf", import.meta.url);

test("CAD-001 parses ASCII DXF into canonical geometry, statistics and preview", async () => {
  const content = await readFile(fixture); const sdk = new CadAgentSdk();
  const document = sdk.parseDocument({ filename:"minimal.dxf", content });
  assert.equal(document.format, "DXF"); assert.equal(document.entities.length, 4);
  assert.deepEqual(document.statistics.byType, { LINE:1, CIRCLE:1, LWPOLYLINE:1, TEXT:1 });
  assert.equal(document.statistics.totalLength, 50 + 10 * Math.PI + 40);
  assert.equal(document.statistics.totalArea, 25 * Math.PI + 100);
  assert.deepEqual(document.bounds, { min:{x:0,y:0}, max:{x:30,y:40}, width:30, height:40 });
  assert.match(sdk.preview(document), /^<svg/); assert.match(sdk.preview(document), /data-layer="WALLS"/);
  assert.equal(sdk.validateDrawing(document).valid, true);
});

test("loader verifies signatures, size and adapter availability", () => {
  assert.throws(() => loadCadDocument({filename:"bad.pdf",content:Buffer.from("not pdf")}), error => error instanceof CadError && error.code === "CAD_SIGNATURE_INVALID");
  assert.throws(() => loadCadDocument({filename:"large.dxf",content:Buffer.from("0\nSECTION\n"),maxBytes:2}), error => error.code === "CAD_DOCUMENT_TOO_LARGE");
  const sdk = new CadAgentSdk(); const pdf=loadCadDocument({filename:"drawing.pdf",content:Buffer.from("%PDF-1.7")});
  assert.throws(() => sdk.parseDocument({filename:pdf.filename,content:pdf.bytes}), error => error.code === "CAD_ADAPTER_UNAVAILABLE");
  assert.throws(() => sdk.exportDXF({}), error => error.code === "CAD_CAPABILITY_NOT_IMPLEMENTED");
});
