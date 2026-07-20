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
