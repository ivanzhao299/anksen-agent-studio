#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { CapabilityResourceRegistry } from "../lib/capability-resource-registry.mjs";

const repoRoot=resolve(new URL("../../..",import.meta.url).pathname),registry=new CapabilityResourceRegistry({repoRoot}),command=process.argv[2]??"inventory",resourceId=process.argv[3],presetId=process.argv[4];
const gitTimeoutMs=120_000;

function runGit(args){return spawnSync("git",args,{encoding:"utf8",timeout:gitTimeoutMs});}

function assertGit(result,fallback){
  if(result.error?.code==="ETIMEDOUT")throw new Error("CAPABILITY_RESOURCE_SYNC_TIMEOUT");
  if(result.status!==0)throw new Error(result.stderr||fallback);
}

function fetchPinnedResource(definition,target){
  let result=runGit(["-C",target,"rev-parse","--git-dir"]);
  if(result.status!==0){
    assertGit(runGit(["init",target]),"CAPABILITY_RESOURCE_INIT_FAILED");
    assertGit(runGit(["-C",target,"remote","add","origin",definition.source_url]),"CAPABILITY_RESOURCE_REMOTE_FAILED");
  }
  for(let attempt=1;attempt<=3;attempt+=1){
    result=runGit(["-C",target,"fetch","--depth=1","--no-tags","origin",definition.source_commit]);
    if(result.status===0)break;
    if(attempt<3)console.error(`Capability resource fetch retry ${attempt}/3: ${definition.resource_id}`);
  }
  assertGit(result,"CAPABILITY_RESOURCE_FETCH_FAILED");
  assertGit(runGit(["-C",target,"checkout","--detach","--force","FETCH_HEAD"]),"CAPABILITY_RESOURCE_CHECKOUT_FAILED");
}
if(command==="inventory"){
  const inventory=await registry.inventory();
  console.log(JSON.stringify(inventory,null,2));
  if(inventory.summary.ready!==inventory.summary.total)throw new Error("CAPABILITY_RESOURCE_INTEGRITY_BLOCKED");
}
else if(command==="show"){if(!resourceId||!presetId)throw new Error("Usage: capability-resources show <resource-id> <preset-id>");console.log(JSON.stringify(await registry.resolve(resourceId,presetId,{includeContent:process.argv.includes("--content")}),null,2));}
else if(command==="sync"){
  const definition=(await registry.load()).resources.find(item=>item.resource_id===(resourceId??"awesome-design-md"));if(!definition)throw new Error("CAPABILITY_RESOURCE_NOT_FOUND");const target=resolve(repoRoot,definition.local_path);await mkdir(resolve(target,".."),{recursive:true});
  if(!resolve(target).startsWith(resolve(repoRoot,"runtime/capability-resources")))throw new Error("CAPABILITY_RESOURCE_TARGET_INVALID");
  fetchPinnedResource(definition,target);
  const inventory=await registry.inventory(),synced=inventory.resources.find(item=>item.resource_id===definition.resource_id);console.log(JSON.stringify(inventory,null,2));if(synced?.integrity_status!=="PASS")throw new Error(`CAPABILITY_RESOURCE_INTEGRITY_BLOCKED:${definition.resource_id}`);
}else throw new Error("Usage: capability-resources <inventory|sync|show>");
