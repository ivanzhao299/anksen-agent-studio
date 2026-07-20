import { createHash } from "node:crypto";
import { resolveDomainCapability } from "./domain-center.mjs";
import { professionalBusinessSkillContracts } from "./professional-business-skill-runner.mjs";

const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const unique=(items,key)=>new Set(items.map(item=>item[key])).size===items.length;

export function buildBusinessCapabilityProtocol({application,domain,record=null,registry}){
  const resolved=resolveDomainCapability(domain,registry),skills=new Map((registry.skillRegistry.skills??[]).map(item=>[item.skill_type,item])),agents=new Map((registry.agentRegistry.agents??[]).map(item=>[item.agent_id,item])),workers=new Map((registry.workerRegistry.workers??[]).map(item=>[item.worker_id,item])),errors=[],warnings=[];
  if(!unique(domain.workflow,"key"))errors.push("DUPLICATE_WORKFLOW_STAGE");
  if(!unique(domain.workflow,"businessSkillId"))errors.push("DUPLICATE_BUSINESS_SKILL");
  const stageKeys=new Set(domain.workflow.map(item=>item.key));
  const stages=domain.workflow.map(stage=>{
    const capability=resolved.stages.find(item=>item.key===stage.key),skill=skills.get(stage.skillType),eligibleAgents=(capability?.agentIds??[]).map(id=>agents.get(id)).filter(Boolean),preferred=eligibleAgents.find(item=>item.agent_id===stage.preferredAgentId)??eligibleAgents.sort((a,b)=>Number(a.priority??99)-Number(b.priority??99))[0]??null,worker=workers.get(capability?.workerKey),stageErrors=[];
    if(!skill)stageErrors.push(`SKILL_TYPE_NOT_REGISTERED:${stage.skillType}`);
    if(!preferred)stageErrors.push(`NO_ACTIVE_AGENT:${stage.skillType}`);
    if(preferred&&!(preferred.supported_skills??[]).includes(stage.skillType))stageErrors.push(`AGENT_SKILL_MISMATCH:${preferred.agent_id}:${stage.skillType}`);
    if(!worker)stageErrors.push(`NO_AVAILABLE_WORKER:${stage.skillType}`);
    if(worker&&!(worker.supported_skills??[]).includes(stage.skillType))stageErrors.push(`WORKER_SKILL_MISMATCH:${worker.worker_id}:${stage.skillType}`);
    if(stage.dependsOn&&!stageKeys.has(stage.dependsOn))stageErrors.push(`UNKNOWN_DEPENDENCY:${stage.dependsOn}`);
    errors.push(...stageErrors.map(value=>`${stage.key}:${value}`));
    return{stageId:stage.key,title:stage.title,dependsOn:stage.dependsOn,businessSkillId:stage.businessSkillId,implementationSkill:{skillId:skill?.skill_id??null,skillType:stage.skillType,riskLevel:skill?.risk_level??null,requiredInputs:skill?.required_inputs??[],expectedOutputTypes:skill?.expected_output_types??[]},agent:{agentId:preferred?.agent_id??null,displayName:preferred?.display_name??null,role:preferred?.role??null,eligibleAgentIds:eligibleAgents.map(item=>item.agent_id)},runner:{workerKey:worker?.worker_id??null,runtimeId:worker?.runtime_id??null,adapterId:worker?.adapter_id??null,mode:worker?.process_probe?.on_demand_ok?"ON_DEMAND":worker?"REGISTERED":"MISSING",requiredCapabilities:[stage.skillType]},status:stageErrors.length?"BLOCKED":"READY",blockedReasons:stageErrors};
  });
  const matches=professionalBusinessSkillContracts.filter(item=>item.applicationId===application.id&&item.domainId===domain.id&&(!record||item.objectType===record.objectType));
  if(matches.length>1)errors.push(`DUPLICATE_PROFESSIONAL_RUNNER:${application.id}:${domain.id}:${record?.objectType??"*"}`);
  const professional=matches[0]??null;
  if(!professional)warnings.push(`NO_PROFESSIONAL_OUTCOME_RUNNER:${record?.objectType??domain.id}`);
  const professionalStage=professional?{businessSkillId:professional.businessSkillId,agentId:professional.agentId,agentRole:professional.agentRole,runnerId:professional.runnerId,runtimeType:professional.runtimeType,inputObjects:[...professional.inputObjects],requiredRelations:[...professional.requiredRelations],outputType:professional.outputType,humanApprovalRequired:professional.humanApprovalRequired===true,status:professional.status}:null;
  if(professional&&professional.status!=="ACTIVE")errors.push(`PROFESSIONAL_RUNNER_INACTIVE:${professional.runnerId}`);
  if(professional&&professional.humanApprovalRequired!==true)errors.push(`PROFESSIONAL_HUMAN_GATE_REQUIRED:${professional.runnerId}`);
  const core={schemaVersion:1,applicationId:application.id,domainId:domain.id,objectType:record?.objectType??null,workflowDefinitionId:`${domain.id}-workflow`,workflowDefinitionVersion:"1",orchestrationRuntime:"CONTROLLED_STUB",stages,professionalStage,outcomeMode:professional?"PROFESSIONAL_BUSINESS_OUTCOME":"EXECUTION_EVIDENCE_ONLY",errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
  return Object.freeze({...core,contractId:`business-capability:${application.id}:${domain.id}:${record?.objectType??"catalog"}`,contractHash:hash(core),status:errors.length?"BLOCKED":"READY"});
}

export function validateBusinessCapabilityProtocol(protocol){
  if(!protocol||protocol.schemaVersion!==1||!protocol.contractId||!protocol.contractHash)throw Object.assign(new Error("BUSINESS_CAPABILITY_PROTOCOL_INVALID"),{code:"BUSINESS_CAPABILITY_PROTOCOL_INVALID"});
  const {contractId,contractHash,status,...core}=protocol;if(hash(core)!==contractHash)throw Object.assign(new Error("BUSINESS_CAPABILITY_PROTOCOL_HASH_MISMATCH"),{code:"BUSINESS_CAPABILITY_PROTOCOL_HASH_MISMATCH",contractId});
  if(protocol.status!=="READY"||protocol.errors?.length||!protocol.stages?.length||protocol.stages.some(stage=>stage.status!=="READY"||!stage.businessSkillId||!stage.implementationSkill?.skillId||!stage.agent?.agentId||!stage.runner?.workerKey))throw Object.assign(new Error("BUSINESS_CAPABILITY_PROTOCOL_BLOCKED"),{code:"BUSINESS_CAPABILITY_PROTOCOL_BLOCKED",reasons:protocol.errors??[]});
  return protocol;
}

export function validateCompiledWorkflowAgainstProtocol(workflow,protocol){
  validateBusinessCapabilityProtocol(protocol);const tasks=workflow?.taskGraph?.tasks??workflow?.tasks??[];
  if(tasks.length!==protocol.stages.length)throw Object.assign(new Error("BUSINESS_CAPABILITY_TASK_COUNT_MISMATCH"),{code:"BUSINESS_CAPABILITY_TASK_COUNT_MISMATCH"});
  for(const stage of protocol.stages){const task=tasks.find(item=>item.metadata?.workflowStage===stage.stageId);if(!task||task.metadata?.businessSkillId!==stage.businessSkillId||task.metadata?.skillType!==stage.implementationSkill.skillType||task.metadata?.agentId!==stage.agent.agentId||task.metadata?.workerKey!==stage.runner.workerKey)throw Object.assign(new Error(`BUSINESS_CAPABILITY_ASSIGNMENT_MISMATCH:${stage.stageId}`),{code:"BUSINESS_CAPABILITY_ASSIGNMENT_MISMATCH",stageId:stage.stageId});}
  return workflow;
}
