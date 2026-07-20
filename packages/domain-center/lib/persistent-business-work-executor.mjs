import { PersistentDomainWorkflowService } from "./persistent-domain-workflow.mjs";
import { attachProfessionalBusinessOutcome,buildBusinessWorkResultSummary } from "./business-work-result.mjs";
import { ProfessionalBusinessSkillRunner } from "./professional-business-skill-runner.mjs";

const recordWritebackErrors=new Set(["BUSINESS_RECORD_VERSION_CONFLICT","BUSINESS_RECORD_TRANSITION_DENIED","BUSINESS_RECORD_NOT_FOUND"]);

export class PersistentBusinessWorkExecutor {
  constructor({store,registry,acquirePool,maxCycles=100,professionalSkillRunner=new ProfessionalBusinessSkillRunner()}={}){
    if(!store?.getWorkItemForRunner||!store?.completeWorkflow)throw Object.assign(new Error("BUSINESS_WORK_STORE_REQUIRED"),{code:"BUSINESS_WORK_STORE_REQUIRED"});
    if(!registry)throw Object.assign(new Error("REGISTRY_REQUIRED"),{code:"REGISTRY_REQUIRED"});
    if(typeof acquirePool!=="function")throw Object.assign(new Error("BUSINESS_WORK_POOL_REQUIRED"),{code:"BUSINESS_WORK_POOL_REQUIRED"});
    this.store=store;this.registry=registry;this.acquirePool=acquirePool;this.maxCycles=Math.max(1,Math.min(Number(maxCycles)||100,1000));this.professionalSkillRunner=professionalSkillRunner;
  }

  async taskEvidence(pool,goalId){return(await pool.query("SELECT t.task_key,t.title,t.status,t.metadata#>>'{businessTaskBinding,workflow,stageId}' stage_id,t.metadata#>>'{businessTaskBinding,skill,businessSkillId}' business_skill_id,t.metadata->>'skillType' skill_type,t.metadata->>'agentId' agent_id,t.metadata->>'workerKey' planned_worker,a.attempt_number,a.validation_result,w.worker_key,w.runtime_type FROM ad_task t LEFT JOIN LATERAL(SELECT * FROM ad_task_attempt x WHERE x.task_id=t.id ORDER BY x.attempt_number DESC LIMIT 1)a ON true LEFT JOIN ad_worker w ON w.id=a.worker_id WHERE t.goal_id=$1 ORDER BY t.created_at,t.task_key",[goalId])).rows.map(row=>({...row,duration_ms:row.validation_result?.durationMs??null}));}

  async professionalOutcome(fresh,record,actor){if(!this.professionalSkillRunner?.supports(record)||!this.store.recordDetail)return null;const detail=await this.store.recordDetail(fresh.applicationId,record.id,actor),relatedRecords=(await Promise.all((detail?.relations??[]).filter(relation=>relation.relationType==="CONTROLS"&&relation.record?.id).map(relation=>this.store.getRecord(fresh.applicationId,relation.record.id,actor)))).filter(Boolean);return this.professionalSkillRunner.execute({record,relatedRecords});}

  async execute(item){let pool=null,ownsPool=false;try{
    ({pool,ownsPool=false}=await this.acquirePool());
    const session=(await pool.query("SELECT session_key,status FROM ad_night_shift_session WHERE id=$1",[item.sessionId])).rows[0];if(!session)throw Object.assign(new Error("BUSINESS_WORK_SESSION_NOT_FOUND"),{code:"BUSINESS_WORK_SESSION_NOT_FOUND"});
    const service=new PersistentDomainWorkflowService(pool,{registry:this.registry});let status=session.status;
    for(let count=0;count<this.maxCycles&&status==="RUNNING";count+=1){const result=await service.runOnce(session.session_key);status=result.status??result.sessionStatus??result.report?.sessionStatus??"RUNNING";}
    if(status==="RUNNING")throw Object.assign(new Error("BUSINESS_WORK_RUNNER_LIMIT"),{code:"BUSINESS_WORK_RUNNER_LIMIT"});
    const report=await service.night.loadReport(item.sessionId),tasks=await this.taskEvidence(pool,item.kernelGoalId),fresh=await this.store.getWorkItemForRunner(item.id);if(!fresh||fresh.status!=="RUNNING")return{status:"SKIPPED",reason:"WORK_ITEM_NOT_RUNNING"};
    const actor={organizationId:fresh.organizationId,workspaceId:fresh.workspaceId,userId:"resident-business-runner"},record=await this.store.getRecord(fresh.applicationId,fresh.businessObject.objectId,actor),outcome=report?.sessionStatus==="SUCCEEDED"?await this.professionalOutcome(fresh,record,actor):null,resultSummary=attachProfessionalBusinessOutcome(buildBusinessWorkResultSummary({report,tasks}),outcome),succeeded=report?.sessionStatus==="SUCCEEDED",professionalBlocked=outcome?.decision==="BLOCKED",professionalReview=outcome?.decision==="REVIEW_REQUIRED",reviewStatus=record?.schema.agentReviewStatus,businessStatus=succeeded&&!professionalBlocked&&!professionalReview&&record?.availableTransitions.includes(reviewStatus)?reviewStatus:null,workStatus=!succeeded||professionalBlocked?"BLOCKED":professionalReview?"WAITING_APPROVAL":businessStatus??"COMPLETED";
    try{return await this.store.completeWorkflow(fresh.id,{goalId:fresh.kernelGoalId,sessionId:fresh.sessionId,report,resultSummary,workStatus,businessStatus,expectedObjectVersion:record?.version??null,expectedWorkVersion:fresh.version,actorId:actor.userId});}
    catch(error){if(!recordWritebackErrors.has(error.code))throw error;const latest=await this.store.getWorkItemForRunner(fresh.id);if(!latest||latest.status!=="RUNNING")return{status:"SKIPPED",reason:error.code};return this.store.completeWorkflow(latest.id,{goalId:latest.kernelGoalId,sessionId:latest.sessionId,report,resultSummary,workStatus:"BLOCKED",businessStatus:null,expectedWorkVersion:latest.version,actorId:actor.userId});}
  }finally{if(pool&&ownsPool)await pool.end();}}
}
