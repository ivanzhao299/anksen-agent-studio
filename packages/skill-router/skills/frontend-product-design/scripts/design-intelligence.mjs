#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CapabilityResourceRegistry } from "../../../lib/capability-resource-registry.mjs";

const skillRoot=resolve(fileURLToPath(new URL("..",import.meta.url)));
const repoRoot=resolve(skillRoot,"../../../..");
const query=process.argv[2]?.trim();
const stackIndex=process.argv.indexOf("--stack");
const stack=stackIndex>=0?process.argv[stackIndex+1]:null;
const safeStack=/^[a-z0-9-]{2,32}$/;

if(!query||query.length>240||/[\r\n\0]/.test(query))throw new Error("Usage: design-intelligence.mjs <query> [--stack <stack>]");
if(stack&&!safeStack.test(stack))throw new Error("DESIGN_STACK_INVALID");

const registry=new CapabilityResourceRegistry({repoRoot});
const inventory=await registry.inventory();
const resource=inventory.resources.find(item=>item.resource_id==="ui-ux-pro-max");
if(!resource||resource.integrity_status!=="PASS")throw new Error(`DESIGN_INTELLIGENCE_RESOURCE_BLOCKED: ${(resource?.blocked_reasons??["RESOURCE_NOT_REGISTERED"]).join(",")}`);

const script=resolve(repoRoot,resource.local_path,".claude/skills/ui-ux-pro-max/scripts/search.py");
const args=[script,query,"--design-system","--json"];
if(stack)args.push("--stack",stack);
const result=spawnSync("python3",args,{encoding:"utf8",timeout:20_000,maxBuffer:4*1024*1024});
if(result.status!==0)throw new Error(result.stderr?.trim()||"DESIGN_INTELLIGENCE_SEARCH_FAILED");
const output=JSON.parse(result.stdout),system=output.design_system??{},warnings=[];
const pattern=String(system.pattern?.name??"").toLowerCase(),style=String(system.style?.name??"").toLowerCase();
if(pattern.includes("bento")||String(system.pattern?.sections??"").toLowerCase().includes("card"))warnings.push("Card/Bento recommendations are candidates only; reject them unless each boundary expresses a real interaction or comparison.");
if(String(system.style?.accessibility??"").includes("Limited"))warnings.push("Reject the recommended style unless its contrast, focus, motion, and light/dark behavior can pass accessibility gates.");
if(/cyberpunk|glass|neon/.test(style))warnings.push("Decorative effects must not become the visual thesis; establish information hierarchy and product fit first.");
output.studio_review={status:warnings.length?"REQUIRES_DESIGN_JUDGMENT":"CANDIDATE_READY",warnings,required_next_steps:["Write the experience and visual thesis","Choose the page model and content hierarchy","Record rejected generic patterns","Validate desktop and 390px mobile render"]};
process.stdout.write(`${JSON.stringify(output,null,2)}\n`);
