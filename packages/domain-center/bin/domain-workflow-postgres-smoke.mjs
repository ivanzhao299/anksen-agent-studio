#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createTestPool, ensurePostgresFixture } from "../../orchestrator-core/lib/postgres-fixture.mjs";
import { migrate } from "../../orchestrator-core/lib/persistent-night-shift.mjs";
import { loadDomainRuntimeRegistry } from "../lib/domain-center.mjs";
import { PersistentDomainWorkflowService } from "../lib/persistent-domain-workflow.mjs";

await ensurePostgresFixture();
const pool=createTestPool();
try{
  if(!(await pool.query("SELECT to_regclass('ad_night_shift_session') ok")).rows[0].ok)await migrate(pool,"up");
  const registry=await loadDomainRuntimeRegistry(),service=new PersistentDomainWorkflowService(pool,{registry}),sessionKey=`domain-runtime-${randomUUID()}`;
  const submitted=await service.submit({sessionKey,goal:"优化仪表盘页面并完成测试",explicitDomainId:"software-engineering",scope:{organizationId:"domain-smoke-org",workspaceId:"domain-smoke-workspace",projectId:"domain-smoke-project"}});
  const runner=await service.runDaemon({pollMs:5,idleTimeoutMs:50,maxRuntimeMs:5000});
  const report=await service.night.loadReport(submitted.session.id);
  const facts=(await pool.query("SELECT t.task_key,t.status,t.metadata->>'skillType' skill_type,t.metadata->>'agentId' agent_id,t.metadata->>'workerKey' planned_worker,w.worker_key actual_worker,a.attempt_number,l.status lease_status FROM ad_task t JOIN ad_task_attempt a ON a.task_id=t.id JOIN ad_task_lease l ON l.attempt_id=a.id JOIN ad_worker w ON w.id=l.worker_id WHERE t.goal_id=$1 ORDER BY t.created_at,t.task_key",[submitted.goal.id])).rows;
  const beforeBlocked=(await pool.query("SELECT (SELECT count(*)::int FROM ad_goal) goals,(SELECT count(*)::int FROM ad_night_shift_session) sessions")).rows[0];
  let blockedPreflight=false;
  try{await service.submit({sessionKey:`blocked-${randomUUID()}`,goal:"编制年度财务预算",explicitDomainId:"finance-management"});}catch(error){blockedPreflight=error?.code==="WORKFLOW_BLOCKED";}
  const afterBlocked=(await pool.query("SELECT (SELECT count(*)::int FROM ad_goal) goals,(SELECT count(*)::int FROM ad_night_shift_session) sessions")).rows[0];
  const result={status:report.sessionStatus,goalStatus:report.goalStatus,applicationId:submitted.workflow.application.id,domainId:submitted.workflow.domain.id,tasks:facts.length,attempts:report.attemptCount,claims:report.workerClaimCount,runtimeExecutions:report.runtimeExecutionCount,blockedPreflight,blockedWorkflowCreatedNoRows:beforeBlocked.goals===afterBlocked.goals&&beforeBlocked.sessions===afterBlocked.sessions,runner,facts};
  if(result.status!=="SUCCEEDED"||result.goalStatus!=="SUCCEEDED"||facts.length!==4||!result.blockedPreflight||!result.blockedWorkflowCreatedNoRows||facts.some(fact=>fact.attempt_number!==1||fact.lease_status!=="RELEASED"||!fact.skill_type||!fact.agent_id||fact.planned_worker!=="local-codex-1"||fact.actual_worker!=="local-codex-1"))throw new Error("DOMAIN_RUNTIME_SMOKE_FAILED");
  console.log(JSON.stringify(result,null,2));
}finally{await pool.end();}
