import test from "node:test";
import assert from "node:assert/strict";
import { buildBusinessDelegationPreview, businessDelegationAuditPayload } from "../lib/business-delegation-preview.mjs";
import { getEnterpriseApplication } from "../lib/enterprise-applications.mjs";
import { getBusinessObjectDefinition } from "../lib/business-object-definitions.mjs";
import { loadDomainRuntimeRegistry } from "../lib/domain-center.mjs";

const record=(availableTransitions)=>({id:"expense-1",applicationId:"finance-platform",objectType:"expense",displayKey:"EXP-1",title:"差旅费用审核",version:3,status:"UNDER_REVIEW",availableTransitions,schema:getBusinessObjectDefinition("finance-platform","expense")});

test("business delegation preview resolves the full Workflow Skill Agent Runner contract",async()=>{
  const preview=buildBusinessDelegationPreview({application:getEnterpriseApplication("finance-platform"),record:record(["WAITING_APPROVAL","REJECTED"]),registry:await loadDomainRuntimeRegistry(),generatedAt:"2026-07-21T00:00:00.000Z"});
  assert.equal(preview.status,"READY");assert.equal(preview.businessObject.version,3);assert.equal(preview.workflow.domainId,"finance-management");assert.equal(preview.workflow.expectedWritebackStatus,"WAITING_APPROVAL");assert.equal(preview.stages.length,4);assert.ok(preview.stages.every(stage=>stage.businessSkillId&&stage.skillType&&stage.agentId&&stage.workerKey&&stage.registeredRuntimeId&&stage.status==="READY"));assert.deepEqual(preview.policy,{assignmentPolicy:"CAPABILITY",maxAttempts:1,executionRuntime:"CONTROLLED_STUB",realRuntimeEnabled:false,objectVersionRequired:true});assert.deepEqual(preview.blockedReasons,[]);const audit=businessDelegationAuditPayload(preview);assert.equal(audit.applicationId,"finance-platform");assert.equal(audit.businessObjectId,"expense-1");assert.equal(audit.businessObjectVersion,3);assert.equal(audit.stages.length,4);assert.equal(audit.executionRuntime,"CONTROLLED_STUB");assert.equal(audit.realRuntimeEnabled,false);
});

test("business delegation preview blocks an object that cannot enter Agent review",async()=>{
  const preview=buildBusinessDelegationPreview({application:getEnterpriseApplication("finance-platform"),record:record(["APPROVED"]),registry:await loadDomainRuntimeRegistry()});assert.equal(preview.status,"BLOCKED");assert.ok(preview.blockedReasons.includes("BUSINESS_RECORD_NOT_READY_FOR_AGENT"));
});
