#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { CadAgentSdk } from "../lib/index.mjs";
const sdk=new CadAgentSdk(); const content=await readFile(new URL("../fixtures/minimal.dxf",import.meta.url)); const document=sdk.parseDocument({filename:"minimal.dxf",content});
process.stdout.write(`${JSON.stringify({status:"PASS",capability:"CAD_DXF_FOUNDATION",format:document.format,statistics:document.statistics,bounds:document.bounds,previewBytes:Buffer.byteLength(sdk.preview(document))},null,2)}\n`);
