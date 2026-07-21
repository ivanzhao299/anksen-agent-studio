import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderConsolePage } from "./render.mjs";

const owner={authenticated:true,capabilities:["*"],project_allowlist:["*"]};
test("Engineering CAD Center exposes a truthful multi-input workbench and governed API",async()=>{const html=await renderConsolePage("/cad",owner),server=await readFile(new URL("./server.mjs",import.meta.url),"utf8");for(const value of ["工程图纸分析中心","DXF Foundation READY","DWG / IFC / PDF 可接收检测 · 解析适配器未启用","/api/cad/analyze","cad-document-analyze","CadAgentSdk"])assert.match(html+server,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));assert.doesNotMatch(html,/DWG Foundation READY|IFC Foundation READY|CAD 编辑器/);});

test("CAD intake supports picker, drag and paste without overstating parser readiness",async()=>{const html=await renderConsolePage("/cad",owner);for(const value of ['accept=".dxf,.dwg,.ifc,.pdf','id="cad-dropzone"','role="button"','tabindex="0"','drag-active','clipboardData','navigator.clipboard','Cmd/Ctrl+V','DXF 可分析','DWG 检测','IFC 检测','PDF 检测','CAD_ADAPTER_UNAVAILABLE'])assert.match(html,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));assert.match(html,/button id="cad-analyze"[^>]*disabled/);});

test("console request envelope accommodates a 10MB CAD file after Base64 encoding",async()=>{const server=await readFile(new URL("./server.mjs",import.meta.url),"utf8");assert.match(server,/total > 16 \* 1024 \* 1024/);});
