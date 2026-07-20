import test from "node:test";
import assert from "node:assert/strict";
import { projectBusinessWorkExecution } from "../lib/business-work-execution.mjs";

const workItem={assignmentType:"AGENT",status:"RUNNING",kernelGoalId:"goal-1",resultRef:null};

test("business execution projection exposes safe queued and running progress",()=>{
  const execution=projectBusinessWorkExecution({workItem,tasks:[{taskKey:"plan",taskStatus:"SUCCEEDED"},{taskKey:"execute",stageId:"execute",taskStatus:"CLAIMED",businessSkillId:"finance-review",agentId:"finance-agent",plannedWorker:"resident-1"},{taskKey:"verify",taskStatus:"PENDING"}],session:{status:"RUNNING",schedulerTickCount:3,workerClaimCount:1,runtimeExecutionCount:1,errorSummary:[],startedAt:"2026-07-21T00:00:00.000Z"}});
  assert.equal(execution.phase,"RUNNING");assert.deepEqual(execution.progress,{total:3,succeeded:1,failed:0,blocked:0,running:1,queued:1,percent:33});assert.equal(execution.currentStages[0].businessSkillId,"finance-review");assert.equal(execution.currentStages[0].agentId,"finance-agent");assert.equal(execution.currentStages[0].workerKey,"resident-1");assert.equal(execution.source,"AUTONOMOUS_KERNEL");assert.equal("leaseToken" in execution,false);assert.equal("fencingToken" in execution,false);
});

test("business execution projection derives terminal and fallback phases",()=>{
  assert.equal(projectBusinessWorkExecution({workItem:{...workItem,status:"BLOCKED"},tasks:[]}).phase,"BLOCKED");
  assert.equal(projectBusinessWorkExecution({workItem:{...workItem,status:"COMPLETED",resultRef:"report:1"},tasks:[{taskStatus:"SUCCEEDED"}]}).phase,"COMPLETED");
  assert.equal(projectBusinessWorkExecution({workItem:{assignmentType:"HUMAN",status:"OPEN"}}).phase,"MANUAL");
  assert.equal(projectBusinessWorkExecution({workItem:{assignmentType:"AGENT",status:"OPEN"}}).phase,"AWAITING_DISPATCH");
});
