import test from "node:test";
import assert from "node:assert/strict";
import { enterpriseAcceptanceScenarios, evaluateEnterpriseAcceptance } from "../lib/enterprise-business-acceptance.mjs";

test("enterprise acceptance covers every independent business platform role",()=>{
  assert.deepEqual(enterpriseAcceptanceScenarios.map(item=>item.role),["STRATEGY_OWNER","HR_OPERATOR","FINANCE_REQUESTER","SALES_OPERATOR","MANUFACTURING_PLANNER","PARK_OPERATOR"]);
  assert.equal(new Set(enterpriseAcceptanceScenarios.map(item=>item.applicationId)).size,6);
});

test("enterprise acceptance evaluator refuses incomplete runtime evidence",()=>{
  const evidence=Array.from({length:4},(_,index)=>({stageId:`STAGE-${index}`,businessSkillId:`skill-${index}`,skillType:"document_generation",agentId:`agent-${index}`,runner:{workerKey:"local-codex-1",runtimeType:"CONTROLLED_STUB"},attempt:{status:"SUCCEEDED"},runtimeResult:{status:"SUCCEEDED",fencingValidated:true}}));
  const scenarios=enterpriseAcceptanceScenarios.map(item=>({role:item.role,record:{persistedAfterRestart:true},tenantIsolation:true,businessChain:{relationCount:1,persistedAfterRestart:true},humanWork:{count:1},agentWork:{status:"COMPLETED"},executionEvidence:structuredClone(evidence),kernel:{sessionStatus:"SUCCEEDED",goalStatus:"SUCCEEDED",taskCount:4,attemptCount:4,runtimeExecutionCount:4}}));
  const passing={database:"ISOLATED_POSTGRESQL",scenarios,approval:{status:"APPROVED",replayRejected:true},executiveCockpit:{allApplicationsVisible:true}};
  assert.deepEqual(evaluateEnterpriseAcceptance(passing),{status:"PASS",failures:[]});
  const failing=structuredClone(passing);failing.scenarios[0].kernel.attemptCount=5;
  assert.deepEqual(evaluateEnterpriseAcceptance(failing),{status:"FAIL",failures:["STRATEGY_OWNER:KERNEL_CLOSURE_FAILED"]});
  const missingEvidence=structuredClone(passing);missingEvidence.scenarios[0].executionEvidence[0].runner=null;
  assert.deepEqual(evaluateEnterpriseAcceptance(missingEvidence),{status:"FAIL",failures:["STRATEGY_OWNER:EXECUTION_EVIDENCE_INCOMPLETE"]});
});
