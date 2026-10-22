import {readFile} from "node:fs/promises";
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderConsolePage} from './render.mjs';
const owner={authenticated:true,user:{user_id:'fixture-owner',display_name:'验收账号'},roles:[{role_id:'platform_owner'}],capabilities:['*'],project_allowlist:['*']};
test('old video business surface remains default and new workbench is a separate opt-in surface',async()=>{
 const before=process.env.STUDIO_MEDIA_WORKBENCH_ENABLED;try{delete process.env.STUDIO_MEDIA_WORKBENCH_ENABLED;const old=await renderConsolePage('/video',owner);assert.doesNotMatch(old,/打开影音工作台 →/);assert.doesNotMatch(old,/id="mw-text"/);process.env.STUDIO_MEDIA_WORKBENCH_ENABLED='true';const entry=await renderConsolePage('/video',owner);assert.ok(/href="\/video\/workbench\?project=[^"]+"/.test(entry),"media entry preserves active project context");const workbench=await renderConsolePage('/video',owner,{mediaWorkbench:true,mediaProjectIds:['fixture-project']});for(const text of ['id="mw-text"','id="mw-profile"','id="mw-parameters"','id="mw-video"','/assets/media-workbench.js'])assert.ok(workbench.includes(text));assert.match(workbench,/>视频工厂</);assert.doesNotMatch(workbench,/__TOKEN__/);}finally{if(before===undefined)delete process.env.STUDIO_MEDIA_WORKBENCH_ENABLED;else process.env.STUDIO_MEDIA_WORKBENCH_ENABLED=before;}
});

test('narrow release can disable existing startup schema writes without switching the business backend',async()=>{const source=await readFile(new URL('./server.mjs',import.meta.url),'utf8');assert.match(source,/createBusinessApplicationRuntime\(\{ repoRoot, initializeSchema: process.env.STUDIO_BUSINESS_SCHEMA_INIT !== "false" \}\)/);});
