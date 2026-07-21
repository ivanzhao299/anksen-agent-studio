import { randomUUID } from "node:crypto";
import { loadDomainRuntimeRegistry } from "./domain-center.mjs";
import { PersistentDomainWorkflowService } from "./persistent-domain-workflow.mjs";
import { PersistentBusinessWorkExecutor } from "./persistent-business-work-executor.mjs";
import { ResidentBusinessWorkRunner } from "./resident-business-work-runner.mjs";

const scenarios=[
  {id:"finance",applicationId:"finance-platform",objectType:"expense",status:"UNDER_REVIEW",ownerId:"finance-controller",assigneeId:"finance-control-agent",title:"权威来源费用审核",fields:{expenseDate:"2026-07-21",department:"集团运营",category:"采购",amount:6800,currency:"CNY",budgetCode:"PILOT-OPS",description:"隔离试点费用"}},
  {id:"hr",applicationId:"human-resources-platform",objectType:"onboarding_case",status:"PREPARING",ownerId:"hr-operations",assigneeId:"hr-onboarding-control-agent",title:"权威来源入职准备",fields:{employeeName:"受控候选人引用",candidateRef:"CAND-PILOT",department:"经营中心",positionName:"经营分析",employmentType:"全职",startDate:"2026-08-01",manager:"经营负责人",identityVerificationRef:"IDV-PILOT",contractDocumentRef:"CONTRACT-PILOT",equipmentRequestRef:"EQUIP-PILOT",accessProfileRef:"ACCESS-MIN-PILOT"}},
  {id:"manufacturing",applicationId:"intelligent-manufacturing-erp",objectType:"work_order",status:"MATERIAL_CHECK",ownerId:"production-planner",assigneeId:"manufacturing-readiness-agent",title:"权威来源生产工单",fields:{productCode:"PILOT-001",quantity:10,unit:"台",dueDate:"2026-08-31",plant:"试点工厂",priority:"关键"}},
  {id:"smart-park",applicationId:"smart-park-platform",objectType:"service_order",status:"IN_PROGRESS",ownerId:"park-operations",assigneeId:"park-service-control-agent",title:"权威来源园区服务单",fields:{enterpriseName:"试点企业",serviceType:"报修",location:"A1 厂房",requestedAt:"2026-07-21T08:00:00Z",slaHours:4,priority:"紧急",assignedTeam:"设施班组",description:"空调无法启动",resolutionSummary:"完成受控复测",completionEvidenceRef:"SERVICE-PILOT",resolvedAt:"2026-07-21T10:00:00Z"}},
  {id:"growth",applicationId:"ai-growth-sales-platform",objectType:"publish_plan",status:"PLANNING",ownerId:"growth-operations",assigneeId:"growth-publishing-control-agent",title:"权威来源发布计划",fields:{campaignRef:"CAM-PILOT",productCode:"PROD-PILOT",channel:"视频号",accountRef:"ACCOUNT-PILOT",scheduledAt:"2026-08-15",expectedAssetCount:1,publishMode:"人工确认后自动发布"}}
];

export async function runEnterpriseBusinessPilot({runtime,scope,clock=()=>new Date()}={}){
  if(!runtime?.pool||!runtime?.connectorStore)throw Object.assign(new Error("ENTERPRISE_PILOT_POSTGRESQL_REQUIRED"),{code:"ENTERPRISE_PILOT_POSTGRESQL_REQUIRED"});
  const registry=await loadDomainRuntimeRegistry();
  const workflowService=new PersistentDomainWorkflowService(runtime.pool,{registry});
  const executor=new PersistentBusinessWorkExecutor({store:runtime.store,registry,acquirePool:async()=>({pool:runtime.pool,ownsPool:false})});
  const runId=randomUUID(),startedAt=clock().toISOString(),results=[];
  for(const scenario of scenarios){
    const connector=await runtime.connectorStore.register({id:`pilot-${scenario.id}-${runId.slice(0,12)}`,applicationId:scenario.applicationId,sourceSystem:`isolated-${scenario.id}-fixture`,connectorType:"FIXTURE",allowedObjectTypes:[scenario.objectType],freshnessSeconds:86400},scope);
    const sync=await runtime.connectorStore.ingest(connector.id,{idempotencyKey:`pilot:${runId}:${scenario.id}`,evidenceRef:`fixture://enterprise-pilot/${runId}/${scenario.id}`,observedAt:clock().toISOString(),records:[{sourceRecordKey:`${runId}:${scenario.id}`,objectType:scenario.objectType,displayKey:`PILOT-${scenario.id.toUpperCase()}-${runId.slice(0,8)}`,title:scenario.title,ownerId:scenario.ownerId,status:scenario.status,fields:scenario.fields}]},scope);
    const record=await runtime.store.getRecord(scenario.applicationId,sync.items[0].businessRecordId,scope);
    const work=await runtime.store.createWorkItem({applicationId:scenario.applicationId,businessObjectId:record.id,assignmentType:"AGENT",assigneeId:scenario.assigneeId,title:scenario.title,idempotencyKey:`pilot-work:${runId}:${scenario.id}`},scope);
    const sessionKey=`enterprise-pilot:${runId}:${scenario.id}`,submission=await workflowService.submit({sessionKey,goal:scenario.title,explicitDomainId:record.schema.workflowDomainId,scope});
    const session=submission.session,goalId=submission.goal?.id??session.goal_id;
    const attached=await runtime.store.attachWorkflow(work.id,{goalId,sessionId:session.id,report:null,status:"RUNNING",expectedWorkVersion:work.version});
    await workflowService.kernel.schedulerTick({dryRun:false,limit:10000});
    await workflowService.kernel.schedulerTick({dryRun:false,limit:10000});
    let executionError=null;
    const isolatedRunnerStore={runnableAgentWorkItems:async()=>{const item=await runtime.store.getWorkItemForRunner(attached.id);return item?.status==="RUNNING"?[item]:[];},getWorkItemForRunner:id=>runtime.store.getWorkItemForRunner(id)};
    const runner=new ResidentBusinessWorkRunner({store:isolatedRunnerStore,pool:runtime.pool,executeWork:item=>executor.execute(item),batchSize:1,concurrency:1,onError:error=>{executionError=error;}});
    await runner.tick();
    const completed=await runtime.store.getWorkItemForRunner(attached.id);
    results.push({scenario:scenario.id,applicationId:scenario.applicationId,connectorId:connector.id,batchId:sync.batch.id,businessRecordId:record.id,source:record.source,sessionId:session.id,goalId:session.goal_id,workItemId:completed.id,workStatus:completed.status,professionalDecision:completed.resultSummary?.professionalOutcome?.decision??null,businessOutcomeProduced:completed.resultSummary?.businessOutcomeProduced===true,nextAction:completed.resultSummary?.nextAction??null,runtimeType:"CONTROLLED_STUB",runner:runner.snapshot(),error:executionError?{code:executionError.code??"BUSINESS_PILOT_EXECUTION_FAILED",message:executionError.message}:null});
  }
  return{status:results.every(item=>item.businessOutcomeProduced)?"COMPLETED":"FAILED",runId,startedAt,completedAt:clock().toISOString(),scope:{organizationId:scope.organizationId,workspaceId:scope.workspaceId},runtimeSafety:{realCodexEnabled:false,productionDatabaseUsed:false,sourceType:"ISOLATED_FIXTURE"},summary:{connectors:results.length,batches:results.length,workflows:results.length,outcomes:results.filter(item=>item.businessOutcomeProduced).length,passed:results.filter(item=>item.professionalDecision==="PASS").length,blocked:results.filter(item=>item.professionalDecision==="BLOCKED").length,reviewRequired:results.filter(item=>item.professionalDecision==="REVIEW_REQUIRED").length},results};
}

export const enterpriseBusinessPilotScenarios=scenarios.map(({fields,...scenario})=>scenario);
