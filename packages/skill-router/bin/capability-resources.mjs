#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { CapabilityResourceRegistry } from "../lib/capability-resource-registry.mjs";

const repoRoot=resolve(new URL("../../..",import.meta.url).pathname),registry=new CapabilityResourceRegistry({repoRoot}),command=process.argv[2]??"inventory",resourceId=process.argv[3],presetId=process.argv[4];
if(command==="inventory"){
  const inventory=await registry.inventory();
  console.log(JSON.stringify(inventory,null,2));
  if(inventory.summary.ready!==inventory.summary.total)throw new Error("CAPABILITY_RESOURCE_INTEGRITY_BLOCKED");
}
else if(command==="show"){if(!resourceId||!presetId)throw new Error("Usage: capability-resources show <resource-id> <preset-id>");console.log(JSON.stringify(await registry.resolve(resourceId,presetId,{includeContent:process.argv.includes("--content")}),null,2));}
else if(command==="sync"){
  const definition=(await registry.load()).resources.find(item=>item.resource_id===(resourceId??"awesome-design-md"));if(!definition)throw new Error("CAPABILITY_RESOURCE_NOT_FOUND");const target=resolve(repoRoot,definition.local_path);await mkdir(resolve(target,".."),{recursive:true});
  let result;if((await registry.inventory()).resources.find(item=>item.resource_id===definition.resource_id)?.installation_status==="INSTALLED")result=spawnSync("git",["-C",target,"fetch","--prune","origin"],{encoding:"utf8"});else result=spawnSync("git",["clone","--filter=blob:none",definition.source_url,target],{encoding:"utf8"});if(result.status===0)result=spawnSync("git",["-C",target,"checkout","--detach",definition.source_commit],{encoding:"utf8"});
  if(result.status!==0)throw new Error(result.stderr||"CAPABILITY_RESOURCE_SYNC_FAILED");if(!resolve(target).startsWith(resolve(repoRoot,"runtime/capability-resources")))throw new Error("CAPABILITY_RESOURCE_TARGET_INVALID");const inventory=await registry.inventory(),synced=inventory.resources.find(item=>item.resource_id===definition.resource_id);console.log(JSON.stringify(inventory,null,2));if(synced?.integrity_status!=="PASS")throw new Error(`CAPABILITY_RESOURCE_INTEGRITY_BLOCKED:${definition.resource_id}`);
}else throw new Error("Usage: capability-resources <inventory|sync|show>");
