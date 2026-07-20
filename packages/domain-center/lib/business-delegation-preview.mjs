import { businessWorkflowGoal } from "./business-object-definitions.mjs";
import { domainCenterSummary, resolveDomainCapability } from "./domain-center.mjs";

export function buildBusinessDelegationPreview({application,record,registry,generatedAt=new Date().toISOString()}) {
  const catalog=domainCenterSummary(),catalogApplication=catalog.applications.find(item=>item.id===application.id),domain=catalogApplication?.domains?.find(item=>item.id===record.schema.workflowDomainId);
  if(!domain)throw Object.assign(new Error("APPLICATION_WORKFLOW_NOT_FOUND"),{code:"APPLICATION_WORKFLOW_NOT_FOUND"});
  const capability=resolveDomainCapability(domain,registry),reviewStatus=record.schema.agentReviewStatus,recordReady=record.availableTransitions.includes(reviewStatus),blockedReasons=[...(!recordReady?["BUSINESS_RECORD_NOT_READY_FOR_AGENT"]:[]),...capability.blockedReasons];
  return {
    status:blockedReasons.length?"BLOCKED":"READY",
    generatedAt,
    businessObject:{applicationId:application.id,objectType:record.objectType,objectId:record.id,displayKey:record.displayKey,title:record.title,version:record.version,status:record.status},
    goal:businessWorkflowGoal(application.id,record),
    workflow:{domainId:domain.id,domainName:domain.name,definitionId:`${domain.id}-workflow`,definitionVersion:"1",expectedWritebackStatus:reviewStatus},
    stages:capability.stages.map(stage=>{const worker=(registry.workerRegistry.workers??[]).find(item=>item.worker_id===stage.workerKey);return{stageId:stage.key,title:stage.title,businessSkillId:stage.businessSkillId,skillType:stage.skillType,agentId:stage.agentIds?.[0]??null,eligibleAgentIds:stage.agentIds??[],workerKey:stage.workerKey,runnerMode:worker?.process_probe?.on_demand_ok?"ON_DEMAND":"REGISTERED",registeredRuntimeId:stage.runtimeId,status:stage.ready?"READY":"BLOCKED"};}),
    policy:{assignmentPolicy:"CAPABILITY",maxAttempts:1,executionRuntime:"CONTROLLED_STUB",realRuntimeEnabled:false,objectVersionRequired:true},
    blockedReasons
  };
}

export function businessDelegationAuditPayload(preview) {
  if(!preview||preview.status!=="READY"||!Number.isInteger(Number(preview.businessObject?.version)))throw Object.assign(new Error("BUSINESS_DELEGATION_PLAN_INVALID"),{code:"BUSINESS_DELEGATION_PLAN_INVALID"});
  const stages=(preview.stages??[]).slice(0,20).map(stage=>({stageId:String(stage.stageId),businessSkillId:String(stage.businessSkillId),skillType:String(stage.skillType),agentId:String(stage.agentId),workerKey:String(stage.workerKey),runnerMode:String(stage.runnerMode),status:String(stage.status)}));
  if(!stages.length||stages.some(stage=>!stage.stageId||!stage.businessSkillId||!stage.skillType||!stage.agentId||!stage.workerKey||stage.status!=="READY"))throw Object.assign(new Error("BUSINESS_DELEGATION_PLAN_INVALID"),{code:"BUSINESS_DELEGATION_PLAN_INVALID"});
  return{preflightGeneratedAt:String(preview.generatedAt),applicationId:String(preview.businessObject.applicationId),objectType:String(preview.businessObject.objectType),businessObjectId:String(preview.businessObject.objectId),businessObjectVersion:Number(preview.businessObject.version),domainId:String(preview.workflow.domainId),workflowDefinitionId:String(preview.workflow.definitionId),workflowDefinitionVersion:String(preview.workflow.definitionVersion),expectedWritebackStatus:String(preview.workflow.expectedWritebackStatus),executionRuntime:String(preview.policy.executionRuntime),realRuntimeEnabled:preview.policy.realRuntimeEnabled===true,maxAttempts:Number(preview.policy.maxAttempts),stages};
}
