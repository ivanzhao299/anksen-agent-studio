import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { BusinessApplicationStore } from "../lib/business-application-store.mjs";

test("business exception center is scoped, application-filtered and distinguishes Agent blockage", async () => {
  const root=await mkdtemp(resolve(tmpdir(),"business-exceptions-")),storePath=resolve(root,"runtime/business-applications/store.json"),now="2026-07-21T08:00:00.000Z";
  await mkdir(resolve(storePath,".."),{recursive:true});
  await writeFile(storePath,JSON.stringify({schemaVersion:3,approvals:[],relations:[],events:[],records:[
    {id:"record-finance",organizationId:"org-a",workspaceId:"ws-a",applicationId:"finance",objectType:"expense",displayKey:"EXP-1",title:"异常费用",status:"REJECTED",ownerId:"finance-owner",updatedAt:now},
    {id:"record-park",organizationId:"org-a",workspaceId:"ws-a",applicationId:"smart-park",objectType:"service",displayKey:"SRV-1",title:"园区故障",status:"FAULT",ownerId:"park-owner",updatedAt:now},
    {id:"record-other",organizationId:"org-b",workspaceId:"ws-a",applicationId:"finance",objectType:"expense",displayKey:"EXP-2",title:"其他租户",status:"REJECTED",ownerId:"other",updatedAt:now}
  ],workItems:[{id:"work-finance",organizationId:"org-a",workspaceId:"ws-a",applicationId:"finance",businessObject:{objectType:"expense",objectId:"record-finance",displayKey:"EXP-1",href:"/finance?record=record-finance"},title:"Agent 复核费用",status:"BLOCKED",assignmentType:"AGENT",assigneeId:"finance-agent",delegatedBy:"finance-owner",updatedAt:now}]}));
  const result=await new BusinessApplicationStore({repoRoot:root,storePath,clock:()=>new Date(now)}).businessExceptions({organizationId:"org-a",workspaceId:"ws-a",applicationIds:["finance"]});
  assert.equal(result.summary.total,2);assert.equal(result.summary.records,1);assert.equal(result.summary.workItems,1);assert.equal(result.summary.agentBlocked,1);assert.deepEqual(result.summary.byApplication,{"finance-platform":2});assert.ok(result.items.every(item=>item.applicationId==="finance-platform"));assert.ok(result.items.every(item=>item.href.includes("record-finance")));
});
