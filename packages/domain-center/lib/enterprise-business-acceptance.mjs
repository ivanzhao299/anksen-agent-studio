import { randomUUID } from "node:crypto";
import { createBusinessTaskBinding } from "../../orchestrator-core/lib/business-task-binding.mjs";
import { getBusinessObjectDefinition } from "./business-object-definitions.mjs";
import { loadDomainRuntimeRegistry } from "./domain-center.mjs";
import { enterpriseApplications } from "./enterprise-applications.mjs";
import { PersistentDomainWorkflowService } from "./persistent-domain-workflow.mjs";
import { PostgresBusinessApplicationStore } from "./postgres-business-application-store.mjs";

export const enterpriseAcceptanceScenarios = Object.freeze([
  { role:"STRATEGY_OWNER", applicationId:"enterprise-strategy-platform", objectType:"objective", title:"提升集团经营质量", fields:{period:"2027-2029",perspective:"增长",targetValue:18,unit:"%",responsibleCenter:"集团战略中心"}, related:{direction:"OUTGOING",objectType:"kpi",relationType:"MEASURED_BY",title:"经营质量完成率",fields:{period:"2027",baseline:10,targetValue:18,actualValue:12,unit:"%",ownerDepartment:"集团战略中心"}} },
  { role:"HR_OPERATOR", applicationId:"human-resources-platform", objectType:"recruitment_case", title:"招聘经营分析负责人", fields:{department:"集团经营中心",positionName:"经营分析负责人",headcount:1,targetDate:"2026-10-01",employmentType:"全职",reason:"补充跨业务分析能力"}, related:{direction:"OUTGOING",objectType:"onboarding_case",relationType:"RESULTS_IN",title:"经营分析负责人入职",fields:{employeeName:"验收候选人",department:"集团经营中心",positionName:"经营分析负责人",startDate:"2026-10-01",manager:"经营中心负责人"}} },
  { role:"FINANCE_REQUESTER", applicationId:"finance-platform", objectType:"expense", title:"经营分析系统服务费", fields:{expenseDate:"2026-07-21",department:"集团经营中心",category:"采购",amount:6800,currency:"CNY",budgetCode:"OPS-2026",description:"隔离验收数据"}, approvalRole:"FINANCE_REVIEWER", related:{direction:"INCOMING",objectType:"budget",relationType:"CONTROLS",title:"集团运营预算",fields:{fiscalYear:2026,department:"集团经营中心",budgetCode:"OPS-2026",amount:100000,currency:"CNY"}} },
  { role:"SALES_OPERATOR", applicationId:"ai-growth-sales-platform", objectType:"lead", title:"智能制造客户线索", fields:{source:"官网",contactName:"验收联系人",company:"隔离测试企业",contactChannel:"credential-ref://acceptance/contact",consentStatus:"已授权",interest:"生产数字化"}, related:{direction:"OUTGOING",objectType:"opportunity",relationType:"CONVERTS_TO",title:"智能制造升级商机",fields:{customerName:"隔离测试企业",productCode:"MFG-AI",estimatedAmount:200000,probability:60,expectedCloseDate:"2026-12-31",owner:"销售负责人"}} },
  { role:"MANUFACTURING_PLANNER", applicationId:"intelligent-manufacturing-erp", objectType:"work_order", title:"验收生产工单", fields:{productCode:"ACC-P001",quantity:20,unit:"台",dueDate:"2026-08-31",plant:"验收工厂",priority:"关键"}, related:{direction:"INCOMING",objectType:"bom",relationType:"USED_BY",title:"ACC-P001 产品 BOM",fields:{productCode:"ACC-P001",revision:"A",plant:"验收工厂",effectiveDate:"2026-07-01",componentCount:8}} },
  { role:"PARK_OPERATOR", applicationId:"smart-park-platform", objectType:"service_order", title:"验收园区服务工单", fields:{enterpriseName:"隔离测试企业",serviceType:"报修",location:"A1-101",slaHours:4,description:"空调控制器告警"}, related:{direction:"INCOMING",objectType:"enterprise",relationType:"REQUESTS",title:"隔离测试入园企业",fields:{creditCode:"91320000ACCEPTANCE",industry:"智能制造",contactName:"验收联系人",contactPhone:"credential-ref://acceptance/phone",requestedArea:500}} }
]);

const scopeFor = (runId, role) => ({ organizationId:`acceptance-org-${runId}`, workspaceId:`acceptance-workspace-${runId}`, projectId:`acceptance-project-${runId}`, userId:role.toLowerCase() });

async function runAgentWorkflow({ pool, store, registry, scenario, record, scope, runId }) {
  const schema=getBusinessObjectDefinition(scenario.applicationId,scenario.objectType);
  const runtimeDomainId=schema.workflowDomainId;
  const skillId=`${runtimeDomainId.replaceAll("-","_")}_acceptance`;
  const work=await store.createWorkItem({applicationId:scenario.applicationId,businessObjectId:record.id,assignmentType:"AGENT",assigneeId:"local-codex-1",title:`Agent 处理：${record.title}`,idempotencyKey:`acceptance:${runId}:${scenario.applicationId}:agent`},scope);
  const binding=createBusinessTaskBinding({
    scope:{...scope,applicationId:scenario.applicationId,domainId:runtimeDomainId},
    businessObject:{systemId:scenario.applicationId,objectType:scenario.objectType,objectId:record.id,version:record.version,displayKey:record.displayKey,href:`${enterpriseApplications.find(item=>item.id===scenario.applicationId).path}?record=${record.id}`},
    workflow:{definitionId:`${scenario.objectType}-acceptance`,definitionVersion:"1",instanceId:`acceptance-${runId}-${scenario.applicationId}`,stageId:"PLAN"},
    skill:{businessSkillId:skillId,skillId:"document-generation",skillType:"document_generation",requiredCapabilities:["document_generation"],riskLevel:"LOW"},
    execution:{assignmentPolicy:"CAPABILITY",preferredRuntimeId:"controlled-stub"},
    writeback:{operation:"TRANSITION",expectedObjectVersion:record.version,eventType:`${scenario.applicationId}.acceptance.completed`}
  });
  const workflow=new PersistentDomainWorkflowService(pool,{registry});
  const sessionKey=`enterprise-acceptance:${runId}:${scenario.applicationId}`;
  const submitted=await workflow.submit({sessionKey,goal:schema.workflowGoal(record),explicitDomainId:runtimeDomainId,businessTaskBinding:binding,scope});
  const attached=await store.attachWorkflow(work.id,{goalId:submitted.session.goal_id,sessionId:submitted.session.id,report:null,status:"RUNNING",expectedWorkVersion:work.version});
  await workflow.runDaemon({pollMs:5,idleTimeoutMs:30,maxRuntimeMs:10000});
  const report=await workflow.night.loadReport(submitted.session.id);
  const completed=await store.completeWorkflow(work.id,{goalId:submitted.session.goal_id,sessionId:submitted.session.id,report,workStatus:"COMPLETED",expectedWorkVersion:attached.version,actorId:"controlled-stub"});
  return {work:completed.workItem,report,sessionKey,domainId:runtimeDomainId};
}

export function evaluateEnterpriseAcceptance(report) {
  const failures=[];
  if(report.database!=="ISOLATED_POSTGRESQL")failures.push("DATABASE_NOT_ISOLATED");
  if(report.scenarios.length!==enterpriseAcceptanceScenarios.length)failures.push("ROLE_SCENARIO_MISSING");
  for(const item of report.scenarios){
    if(!item.record.persistedAfterRestart)failures.push(`${item.role}:RESTART_READ_FAILED`);
    if(!item.tenantIsolation)failures.push(`${item.role}:TENANT_ISOLATION_FAILED`);
    if(item.humanWork.count!==1)failures.push(`${item.role}:MY_WORK_FAILED`);
    if(item.businessChain?.relationCount!==1||!item.businessChain?.persistedAfterRestart)failures.push(`${item.role}:BUSINESS_CHAIN_FAILED`);
    if(item.agentWork.status!=="COMPLETED"||item.kernel.sessionStatus!=="SUCCEEDED"||item.kernel.goalStatus!=="SUCCEEDED"||item.kernel.taskCount!==4||item.kernel.attemptCount!==4||item.kernel.runtimeExecutionCount!==4)failures.push(`${item.role}:KERNEL_CLOSURE_FAILED`);
    if(item.executionEvidence?.length!==4||item.executionEvidence.some(task=>!task.stageId||!task.businessSkillId||!task.skillType||!task.agentId||!task.runner?.workerKey||task.runner.runtimeType!=="CONTROLLED_STUB"||task.attempt?.status!=="SUCCEEDED"||task.runtimeResult?.status!=="SUCCEEDED"||task.runtimeResult?.fencingValidated!==true))failures.push(`${item.role}:EXECUTION_EVIDENCE_INCOMPLETE`);
  }
  if(report.approval?.status!=="APPROVED"||report.approval?.replayRejected!==true)failures.push("FINANCE_APPROVAL_FAILED");
  if(!report.executiveCockpit?.allApplicationsVisible)failures.push("COCKPIT_AGGREGATION_FAILED");
  return {status:failures.length?"FAIL":"PASS",failures};
}

export async function runEnterpriseBusinessAcceptance({pool,runId=randomUUID()}={}) {
  if(!pool)throw new Error("ACCEPTANCE_DATABASE_POOL_REQUIRED");
  const startedAt=new Date().toISOString();
  const registry=await loadDomainRuntimeRegistry(),store=new PostgresBusinessApplicationStore({pool}),scenarios=[];
  for(const scenario of enterpriseAcceptanceScenarios){
    const scope=scopeFor(runId,scenario.role),app=enterpriseApplications.find(item=>item.id===scenario.applicationId);
    let record=await store.createRecord(scenario.applicationId,{objectType:scenario.objectType,title:scenario.title,displayKey:`ACC-${scenario.role}-${runId.slice(0,8)}`,fields:scenario.fields},scope);
    const related=await store.createRecord(scenario.applicationId,{objectType:scenario.related.objectType,title:scenario.related.title,displayKey:`ACC-${scenario.related.objectType.toUpperCase()}-${runId.slice(0,8)}`,fields:scenario.related.fields},scope),source=scenario.related.direction==="OUTGOING"?record:related,target=scenario.related.direction==="OUTGOING"?related:record;
    await store.createRelation(scenario.applicationId,source.id,{targetRecordId:target.id,relationType:scenario.related.relationType},scope);
    const initialStatus=record.status,firstTransition=record.availableTransitions[0];
    if(firstTransition)record=await store.transitionRecord(scenario.applicationId,record.id,{expectedVersion:record.version,status:firstTransition},scope);
    const human=await store.createWorkItem({applicationId:scenario.applicationId,businessObjectId:record.id,assignmentType:"HUMAN",assigneeId:scope.userId,title:`人工复核：${record.title}`,idempotencyKey:`acceptance:${runId}:${scenario.applicationId}:human`},scope);
    const agent=await runAgentWorkflow({pool,store,registry,scenario,record,scope,runId});
    const restarted=new PostgresBusinessApplicationStore({pool}),persisted=await restarted.getRecord(scenario.applicationId,record.id,scope),foreign=await restarted.getRecord(scenario.applicationId,record.id,{organizationId:`foreign-${runId}`,workspaceId:scope.workspaceId});
    const myWork=await restarted.myWork(scope),applicationReport=await restarted.applicationReport(scenario.applicationId,scope);
    const detail=await restarted.recordDetail(scenario.applicationId,record.id,scope);
    scenarios.push({role:scenario.role,capability:app.capabilities[0],applicationId:scenario.applicationId,record:{id:record.id,initialStatus,status:persisted.status,version:persisted.version,persistedAfterRestart:Boolean(persisted)},tenantIsolation:foreign===null,businessChain:{relationType:scenario.related.relationType,direction:scenario.related.direction,relatedRecordId:related.id,relationCount:detail.relations.length,persistedAfterRestart:detail.relations.some(item=>item.record.id===related.id)},humanWork:{id:human.id,count:myWork.items.filter(item=>item.assignmentType==="HUMAN").length},agentWork:{id:agent.work.id,status:agent.work.status,assignmentType:agent.work.assignmentType,version:agent.work.version},executionEvidence:detail.workItems.find(item=>item.id===agent.work.id)?.executionEvidence??[],kernel:{sessionKey:agent.sessionKey,domainId:agent.domainId,sessionStatus:agent.report.sessionStatus,goalStatus:agent.report.goalStatus,taskCount:agent.report.totalTasks,attemptCount:agent.report.attemptCount,runtimeExecutionCount:agent.report.runtimeExecutionCount},applicationReport});
  }
  const finance=scenarios.find(item=>item.applicationId==="finance-platform"),financeScope=scopeFor(runId,"FINANCE_REQUESTER");
  let financeRecord=await store.getRecord("finance-platform",finance.record.id,financeScope);
  while(financeRecord.status!=="WAITING_APPROVAL"){
    const next=financeRecord.availableTransitions.find(status=>status==="WAITING_APPROVAL")??financeRecord.availableTransitions[0];
    if(!next)throw new Error("FINANCE_APPROVAL_PATH_MISSING");
    financeRecord=await store.transitionRecord("finance-platform",financeRecord.id,{expectedVersion:financeRecord.version,status:next},financeScope);
  }
  const requested=await store.requestApproval("finance-platform",financeRecord.id,{expectedVersion:financeRecord.version,requestedStatus:"APPROVED",idempotencyKey:`acceptance:${runId}:finance-approval`},financeScope);
  const decision=await store.decideApproval("finance-platform",requested.id,{decision:"APPROVED",comment:"EA-014 isolated acceptance"},{...financeScope,userId:"finance_reviewer"});
  let replayRejected=false;try{await store.decideApproval("finance-platform",requested.id,{decision:"APPROVED"},{...financeScope,userId:"finance_reviewer"});}catch(error){replayRejected=error.code==="BUSINESS_APPROVAL_NOT_PENDING";}
  const reports=await Promise.all(enterpriseApplications.filter(app=>enterpriseAcceptanceScenarios.some(item=>item.applicationId===app.id)).map(async app=>({applicationId:app.id,report:await store.applicationReport(app.id,scopeFor(runId,enterpriseAcceptanceScenarios.find(item=>item.applicationId===app.id).role))})));
  const report={acceptanceId:runId,status:"PENDING",database:"ISOLATED_POSTGRESQL",runtime:"CONTROLLED_STUB",startedAt,scenarios,approval:{id:requested.id,status:decision.approval.status,recordStatus:decision.record.status,replayRejected},executiveCockpit:{applicationCount:reports.length,allApplicationsVisible:reports.length===enterpriseAcceptanceScenarios.length,reports},safety:{productionDatabase:false,realCodex:false,push:false,merge:false,deploy:false}};
  Object.assign(report,evaluateEnterpriseAcceptance(report),{finishedAt:new Date().toISOString()});
  return report;
}
