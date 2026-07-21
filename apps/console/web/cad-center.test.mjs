import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderConsolePage } from "./render.mjs";

const owner={authenticated:true,capabilities:["*"],project_allowlist:["*"]};
test("Engineering CAD Center exposes a truthful read-only DXF workbench and governed API",async()=>{const html=await renderConsolePage("/cad",owner),server=await readFile(new URL("./server.mjs",import.meta.url),"utf8");for(const value of ["工程图纸分析中心","DXF Foundation READY","DWG / IFC / PDF 适配器尚未启用","/api/cad/analyze","cad-document-analyze","CadAgentSdk"])assert.match(html+server,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));assert.doesNotMatch(html,/DWG Foundation READY|IFC Foundation READY|CAD 编辑器/);});
