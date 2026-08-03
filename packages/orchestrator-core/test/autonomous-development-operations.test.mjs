import test from "node:test";
import assert from "node:assert/strict";
import { acceptanceEvidence, maintenanceWindowOpen, normalizeQueuePolicy, operationalSnapshot, orderQueue, redactEvidence, releaseAssistance, resourceBudgetDecision, sha256, validatePilotEvidence } from "../lib/autonomous-development-operations.mjs";

test("existing queue enforces priority, project isolation, fairness and maintenance windows", () => {
  const now=new Date("2026-08-03T12:00:00Z"),base={status:"QUEUED",createdAt:"2026-08-03T10:00:00Z",queuePolicy:{priority:"P2",maintenanceWindow:null}};
  const jobs=[{...base,id:"low",projectId:"a"},{...base,id:"high",projectId:"b",queuePolicy:{priority:"P0"}},{...base,id:"blocked-project",projectId:"c"},{...base,id:"active",projectId:"c",status:"RUNNING"},{...base,id:"window",projectId:"d",queuePolicy:{priority:"P0",maintenanceWindow:{startHourUtc:1,endHourUtc:2}}}];
  assert.deepEqual(orderQueue(jobs,now).map(job=>job.id),["high","low"]);
  assert.equal(maintenanceWindowOpen({startHourUtc:22,endHourUtc:4},new Date("2026-08-03T23:00:00Z")),true);
  assert.throws(()=>normalizeQueuePolicy({priority:"urgent"}),/QUEUE_PRIORITY_INVALID/);
});

test("every acceptance criterion requires executable or explicit review evidence",()=>{
  const criteria=["tests pass","security reviewed"],commands=["pnpm test"];
  assert.equal(acceptanceEvidence(criteria,commands,[{criterion:"tests pass",type:"TEST",reference:"pnpm test"}]).status,"BLOCKED");
  assert.equal(acceptanceEvidence(criteria,commands,[{criterion:"tests pass",type:"TEST",reference:"pnpm test"},{criterion:"security reviewed",type:"REVIEW",reference:"independent reviewer"}]).status,"READY");
});

test("resource budgets fail closed and evidence is redacted and hashed",()=>{
  const job={projectId:"a",resourceBudget:{maxInputTokens:10,maxOutputTokens:10,maxTotalRuntimeSeconds:10,dailyProjectRuntimeSeconds:10},tokenUsage:{inputTokens:11},startedAt:"2026-08-03T11:59:00Z"};
  assert.equal(resourceBudgetDecision(job,[],new Date("2026-08-03T12:00:00Z")).action,"STOP");
  const redacted=redactEvidence("api_key=super-secret-value sk-abcdefghijklmnop");
  assert.equal(redacted.redacted,true);assert.doesNotMatch(redacted.text,/super-secret|sk-/);assert.match(sha256(redacted.text),/^[a-f0-9]{64}$/);
});

test("operations expose metrics alerts and release remains separately approved",()=>{
  const now=new Date("2026-08-03T12:00:00Z"),jobs=[{id:"a",status:"FAILED",projectId:"p",startedAt:"2026-08-03T11:00:00Z",finishedAt:"2026-08-03T11:01:00Z",repairAttemptsUsed:1,tokenUsage:{inputTokens:10},runtimeUsageSeconds:60},{id:"b",status:"QUEUED",projectId:"p",approvalExpiresAt:"2026-08-03T11:00:00Z",tokenUsage:{}}];
  const snapshot=operationalSnapshot(jobs,{status:"OFFLINE",reason:"NO_HEARTBEAT"},now);assert.equal(snapshot.queueDepth,1);assert.ok(snapshot.alerts.some(alert=>alert.code==="WORKER_UNAVAILABLE"));assert.ok(snapshot.alerts.some(alert=>alert.code==="APPROVAL_EXPIRED"));
  const release=releaseAssistance({goal:"Improve safe workflow",changedPaths:["src/a.js"],validation:{status:"PASS"}});assert.match(release.suggestedBranch,/^codex\//);assert.ok(release.requiresSeparateApproval.includes("push"));
});

test("ten-job pilot evidence fails closed on every governance violation",()=>{
  const jobs=Array.from({length:10},(_,index)=>({id:`job-${index}`,projectId:index%2?"a":"b",allowedPaths:["src"],changedPaths:["src/a.js"],agentInstances:[],artifacts:[{sha256:"a".repeat(64)}],delivery:{automaticActions:{push:false,merge:false,deploy:false}}}));
  assert.equal(validatePilotEvidence(jobs).status,"PASS");jobs[0].changedPaths=[".env"];assert.match(validatePilotEvidence(jobs).violations[0],/PATH_ESCAPE/);
});
