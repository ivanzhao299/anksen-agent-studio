import { randomUUID } from "node:crypto";
import { assertEnterpriseApplication } from "../../domain-center/lib/enterprise-applications.mjs";

const roles=new Set(["INPUT","OUTPUT","AFFECTED"]),operations=new Set(["NONE","CREATE","UPDATE","TRANSITION"]),assignments=new Set(["CAPABILITY","PINNED"]),riskLevels=new Set(["LOW","MEDIUM","HIGH","CRITICAL"]);
const required=(value,code)=>{const text=String(value??"").trim();if(!text)throw Object.assign(new Error(code),{code});return text;};
const reference=(value)=>({systemId:required(value?.systemId,"BUSINESS_SYSTEM_REQUIRED"),objectType:required(value?.objectType,"BUSINESS_OBJECT_TYPE_REQUIRED"),objectId:required(value?.objectId,"BUSINESS_OBJECT_ID_REQUIRED"),version:value?.version==null?null:Number(value.version),displayKey:value?.displayKey?String(value.displayKey):null,href:value?.href?String(value.href):null});

export function createBusinessTaskBinding(input={}){
  const taskKind=input.taskKind??"BUSINESS";
  if(!["BUSINESS","PLATFORM"].includes(taskKind))throw Object.assign(new Error("TASK_KIND_INVALID"),{code:"TASK_KIND_INVALID"});
  const application=assertEnterpriseApplication(input.scope?.applicationId);
  const primary=taskKind==="BUSINESS"?reference(input.businessObject):null;
  if(primary&&!application.objectTypes.some(type=>type.id===primary.objectType))throw Object.assign(new Error("BUSINESS_OBJECT_TYPE_DENIED"),{code:"BUSINESS_OBJECT_TYPE_DENIED"});
  const relations=(input.relations??[]).map(item=>{if(!roles.has(item.role))throw Object.assign(new Error("BUSINESS_RELATION_ROLE_INVALID"),{code:"BUSINESS_RELATION_ROLE_INVALID"});return{role:item.role,...reference(item)};});
  const workflow={definitionId:required(input.workflow?.definitionId,"WORKFLOW_DEFINITION_REQUIRED"),definitionVersion:required(input.workflow?.definitionVersion??"1","WORKFLOW_VERSION_REQUIRED"),instanceId:required(input.workflow?.instanceId??randomUUID(),"WORKFLOW_INSTANCE_REQUIRED"),stageId:required(input.workflow?.stageId,"WORKFLOW_STAGE_REQUIRED")};
  const skill={businessSkillId:required(input.skill?.businessSkillId,"BUSINESS_SKILL_REQUIRED"),skillId:required(input.skill?.skillId,"SKILL_ID_REQUIRED"),skillType:required(input.skill?.skillType,"SKILL_TYPE_REQUIRED"),contractVersion:required(input.skill?.contractVersion??"1","SKILL_CONTRACT_VERSION_REQUIRED"),requiredCapabilities:[...new Set((input.skill?.requiredCapabilities??[]).map(String))],riskLevel:input.skill?.riskLevel??"MEDIUM",approvalPolicy:input.skill?.approvalPolicy??"RISK_BASED",idempotencyKey:required(input.skill?.idempotencyKey??`${primary?.systemId??"platform"}:${primary?.objectType??application.id}:${primary?.objectId??workflow.instanceId}:${workflow.definitionId}:${workflow.stageId}:${primary?.version??"latest"}`,"IDEMPOTENCY_KEY_REQUIRED")};
  if(!riskLevels.has(skill.riskLevel))throw Object.assign(new Error("RISK_LEVEL_INVALID"),{code:"RISK_LEVEL_INVALID"});
  const execution={preferredRuntimeId:input.execution?.preferredRuntimeId??null,preferredWorkerKey:input.execution?.preferredWorkerKey??null,assignmentPolicy:input.execution?.assignmentPolicy??"CAPABILITY",runnerClass:input.execution?.runnerClass??null,memoryScopeKey:required(input.execution?.memoryScopeKey??`${application.id}:${primary?.objectType??"platform"}:${primary?.objectId??workflow.instanceId}`,"MEMORY_SCOPE_REQUIRED")};
  if(!assignments.has(execution.assignmentPolicy)||execution.assignmentPolicy==="PINNED"&&!execution.preferredWorkerKey)throw Object.assign(new Error("ASSIGNMENT_POLICY_INVALID"),{code:"ASSIGNMENT_POLICY_INVALID"});
  const writeback={operation:input.writeback?.operation??"NONE",expectedObjectVersion:input.writeback?.expectedObjectVersion??primary?.version??null,resultSchemaRef:input.writeback?.resultSchemaRef??null,eventType:input.writeback?.eventType??null};
  if(!operations.has(writeback.operation))throw Object.assign(new Error("WRITEBACK_OPERATION_INVALID"),{code:"WRITEBACK_OPERATION_INVALID"});
  return Object.freeze({schemaVersion:1,taskKind,scope:{organizationId:required(input.scope?.organizationId,"ORGANIZATION_REQUIRED"),workspaceId:required(input.scope?.workspaceId,"WORKSPACE_REQUIRED"),projectId:required(input.scope?.projectId,"PROJECT_REQUIRED"),applicationId:application.id,domainId:input.scope?.domainId?String(input.scope.domainId):null,userId:input.scope?.userId?String(input.scope.userId):null},businessObject:primary,relations,workflow,skill,execution,writeback});
}

export function isBusinessTaskBinding(value){try{return createBusinessTaskBinding(value).schemaVersion===1;}catch{return false;}}
