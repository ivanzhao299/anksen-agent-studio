import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ensurePostgresFixture,createTestPool } from "../../orchestrator-core/lib/postgres-fixture.mjs";
import { PersistentNightShiftService } from "../../orchestrator-core/lib/persistent-night-shift.mjs";
import { createBusinessApplicationRuntime } from "../lib/business-database.mjs";
import { loadDomainRuntimeRegistry } from "../lib/domain-center.mjs";
import { PersistentBusinessWorkExecutor } from "../lib/persistent-business-work-executor.mjs";
import { ResidentBusinessWorkRunner } from "../lib/resident-business-work-runner.mjs";

const expenseFields={expenseDate:"2026-07-21",department:"运营中心",category:"采购",amount:2600,currency:"CNY",budgetCode:"OPS-01",description:"常驻 Runner 验收"};

test("resident business runner resumes persisted work and isolates item failures",async()=>{
  let pending=[{id:"work-1"},{id:"work-2"}],completed=[];const errors=[],store={runnableAgentWorkItems:async()=>pending};
  const runner=new ResidentBusinessWorkRunner({store,pollMs:50,executeWork:async item=>{if(item.id==="work-1")throw Object.assign(new Error("controlled"),{code:"CONTROLLED_FAILURE"});pending=pending.filter(value=>value.id!==item.id);completed.push(item.id);},onError:(error,item)=>errors.push([error.code,item.id])});
  await runner.tick();await runner.tick();assert.deepEqual(completed,["work-2"]);assert.deepEqual(errors,[["CONTROLLED_FAILURE","work-1"]]);assert.equal(runner.snapshot().failed,1);assert.equal(runner.snapshot().completed,1);assert.equal(runner.snapshot().active,0);assert.equal(runner.snapshot().deferred,1);
});

test("resident runner fails closed and honors persistent drain control",async()=>{
  let desiredState="DRAINING",scans=0,executions=0,stopped=0;const registry={register:async()=>({status:"DRAINING",desiredState,version:1,lastHeartbeatAt:new Date().toISOString()}),heartbeat:async()=>({status:desiredState,desiredState,version:2,lastHeartbeatAt:new Date().toISOString()}),stop:async()=>{stopped+=1;return{status:"OFFLINE",desiredState,version:3};}},store={runnableAgentWorkItems:async()=>{scans+=1;return[{id:"governed-work"}];}};
  const runner=new ResidentBusinessWorkRunner({store,executeWork:async()=>{executions+=1;},nodeRegistry:registry,nodeKey:"runner:test"});
  await runner.tick();assert.equal(scans,0);assert.equal(executions,0);assert.equal(runner.snapshot().desiredState,"DRAINING");desiredState="ONLINE";await runner.tick();assert.equal(scans,1);assert.equal(executions,1);await runner.stop();assert.equal(stopped,1);
  const denied=new ResidentBusinessWorkRunner({store,executeWork:async()=>{executions+=1;},nodeRegistry:{register:async()=>{throw Object.assign(new Error("database unavailable"),{code:"REGISTRY_DOWN"});}},nodeKey:"runner:down"});await denied.tick();assert.equal(scans,1);assert.equal(denied.snapshot().lastError.code,"REGISTRY_DOWN");
});

test("two resident runners execute one persisted business session exactly once after restart",async()=>{
  await ensurePostgresFixture();const pool=createTestPool(),suffix=randomUUID(),scope={organizationId:`resident-org-${suffix}`,workspaceId:`resident-workspace-${suffix}`,projectId:"resident-project",userId:"finance-user"};
  try{
    const store=(await createBusinessApplicationRuntime({repoRoot:process.cwd(),pool})).store,record=await store.createRecord("finance-platform",{objectType:"expense",title:"常驻业务执行",displayKey:`RESIDENT-${suffix}`,fields:expenseFields},scope),work=await store.createWorkItem({applicationId:"finance-platform",businessObjectId:record.id,assignmentType:"AGENT",assigneeId:"agent-finance"},scope),night=new PersistentNightShiftService(pool),sessionKey=`resident-business-${suffix}`,session=await night.acceptGoal(sessionKey,{id:sessionKey,title:"生成财务检查报告",scope}),attached=await store.attachWorkflow(work.id,{goalId:session.goal_id,sessionId:session.id,report:null,status:"RUNNING",expectedWorkVersion:work.version}),executor=new PersistentBusinessWorkExecutor({store,registry:await loadDomainRuntimeRegistry(),acquirePool:async()=>({pool,ownsPool:false})}),runnerStore={runnableAgentWorkItems:async()=>{const item=await store.getWorkItemForRunner(attached.id);return item?.status==="RUNNING"?[item]:[];}},first=new ResidentBusinessWorkRunner({store:runnerStore,pool,executeWork:item=>executor.execute(item)}),second=new ResidentBusinessWorkRunner({store:runnerStore,pool,executeWork:item=>executor.execute(item)});
    assert.equal((await store.getWorkItemForRunner(attached.id)).status,"RUNNING");assert.equal((await store.attachWorkflow(work.id,{goalId:session.goal_id,sessionId:session.id,report:null,status:"RUNNING",expectedWorkVersion:work.version})).version,attached.version);await assert.rejects(()=>store.attachWorkflow(work.id,{goalId:session.goal_id,sessionId:randomUUID(),report:null,status:"RUNNING",expectedWorkVersion:work.version}),error=>error.code==="BUSINESS_WORK_VERSION_CONFLICT");await Promise.all([first.tick(),second.tick()]);const persisted=await store.getWorkItemForRunner(attached.id),report=await night.loadReport(session.id),attempts=Number((await pool.query("SELECT count(*) count FROM ad_task_attempt a JOIN ad_task t ON t.id=a.task_id WHERE t.goal_id=$1",[session.goal_id])).rows[0].count);assert.equal(persisted.status,"COMPLETED",JSON.stringify({first:first.snapshot(),second:second.snapshot()}));assert.equal(persisted.resultSummary.resultType,"EXECUTION_EVIDENCE");assert.equal(persisted.resultSummary.businessOutcomeProduced,false);assert.equal(persisted.resultSummary.stages.length,report.totalTasks);assert.equal(report.sessionStatus,"SUCCEEDED");assert.equal(attempts,report.totalTasks);assert.equal(first.snapshot().claimed+second.snapshot().claimed,1);assert.equal(first.snapshot().completed+second.snapshot().completed,1);assert.deepEqual(await runnerStore.runnableAgentWorkItems(),[]);
  }finally{await pool.end();}
});
