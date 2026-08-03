#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AutonomousDevelopmentJobs } from "../lib/autonomous-development-jobs.mjs";
import { approvalScopeDigest, assertWorkspaceWithinScope, captureGitWorkspace, repairDecision } from "../lib/autonomous-development-policy.mjs";

const repoRoot = resolve(new URL("../../..", import.meta.url).pathname);
const jobs = new AutonomousDevelopmentJobs({ repoRoot });
const worker = { id: process.env.AUTONOMOUS_DEVELOPMENT_WORKER_ID || "resident-codex-dev-1", pid: process.pid };
const codexPath = "/Applications/ChatGPT.app/Contents/Resources/codex";
let stopping = false;
let currentJobId = null;
let currentChild = null;
process.on("SIGTERM", () => { stopping = true; currentChild?.kill("SIGTERM"); });
process.on("SIGINT", () => { stopping = true; currentChild?.kill("SIGTERM"); });

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
function safeEnvironment() { const keys=["HOME","PATH","CODEX_HOME","LANG","LC_ALL","LC_CTYPE","TMPDIR","USER","LOGNAME","SHELL","TERM","COLORTERM","CODEX_SHELL","__CF_USER_TEXT_ENCODING"]; return Object.fromEntries(keys.filter((key)=>process.env[key]).map((key)=>[key,process.env[key]])); }
function parseCodex(text) { let final="",usage={},report=null; for(const line of text.split("\n")){try{const event=JSON.parse(line);if(event.type==="item.completed"&&event.item?.type==="agent_message")final=event.item.text||final;if(event.type==="turn.completed")usage=event.usage||usage;}catch{}} try{report=JSON.parse(text);usage=report.codexEvidence?.tokenUsage||usage;}catch{} return{final,usage,report}; }
function parseStopped(text) { const match=String(text).match(/\{\s*"conclusion"\s*:\s*"STOPPED"[\s\S]*?\}/g); if(!match?.length)return null; try{return JSON.parse(match.at(-1));}catch{return null;} }
function usageAdd(target,source={}) { target.inputTokens+=Number(source.input_tokens||0);target.cachedInputTokens+=Number(source.cached_input_tokens||0);target.outputTokens+=Number(source.output_tokens||0);target.reasoningOutputTokens+=Number(source.reasoning_output_tokens||0); }
function policySafeInstruction(value) { return String(value).replace(/[`;&|]/g," ").replace(/\$\(/g,"("); }
function git(job,args) { return spawnSync("git",["-C",job.projectRoot,...args],{encoding:"utf8"}); }

async function runProcess(command,args,{cwd,timeoutMs,onChunk,jobId}={}) {
  return new Promise((resolvePromise,reject)=>{
    const child=spawn(command,args,{cwd,env:safeEnvironment(),shell:false,stdio:["ignore","pipe","pipe"]});
    currentChild=child;
    let stdout="",stderr="",timer=null,cancelTimer=null,chunkChain=Promise.resolve(),cancelled=false;
    const chunk=(stream,data)=>{const value=data.toString();if(stream==="stdout")stdout+=value;else stderr+=value;chunkChain=chunkChain.then(async()=>{await onChunk?.(stream,value,child.pid);if(jobId&&!cancelled&&(await jobs.get(jobId))?.status==="CANCELLED"){cancelled=true;child.kill("SIGTERM");}}).catch(()=>{});};
    child.stdout.on("data",(data)=>chunk("stdout",data));child.stderr.on("data",(data)=>chunk("stderr",data));child.on("error",reject);
    child.on("close",async(code,signal)=>{if(timer)clearTimeout(timer);if(cancelTimer)clearInterval(cancelTimer);currentChild=null;await chunkChain;resolvePromise({code,signal,stdout,stderr,pid:child.pid,cancelled});});
    if(timeoutMs)timer=setTimeout(()=>child.kill("SIGTERM"),timeoutMs);
    if(jobId)cancelTimer=setInterval(async()=>{if(!cancelled&&(await jobs.get(jobId))?.status==="CANCELLED"){cancelled=true;child.kill("SIGTERM");}},1000);
  });
}

async function role(job,roleName,prompt) {
  job.stage=roleName==="PLANNER"?"PLANNING":roleName;
  const instance={id:`${job.id}-${roleName.toLowerCase()}-${job.agentInstances.filter((item)=>item.role===roleName).length+1}`,role:roleName,status:"RUNNING",runtimeType:"CODEX",model:"codex-default",skillPack:{PLANNER:["repository_analysis","solution_planning"],VALIDATOR:["quality_validation"],REVIEWER:["security_review","delivery_reporting"]}[roleName]??["software_delivery"],startedAt:new Date().toISOString(),finishedAt:null,pid:null,tokenUsage:null};
  job.agentInstances.push(instance);await jobs.event(job,"AGENT_STARTED",{agentInstanceId:instance.id,role:roleName});
  const result=await runProcess(codexPath,["exec","--ephemeral","--json","--sandbox","read-only","--cd",job.projectRoot,prompt],{cwd:job.projectRoot,jobId:job.id,timeoutMs:job.maxRuntimeSeconds*1000,onChunk:async(stream,value,pid)=>{instance.pid=pid;await jobs.heartbeat(worker,job.id);await jobs.event(job,"AGENT_LOG",{agentInstanceId:instance.id,stream,message:value.slice(0,2000)});}});
  const parsed=parseCodex(result.stdout);instance.status=result.code===0?"SUCCEEDED":result.cancelled?"CANCELLED":"FAILED";instance.finishedAt=new Date().toISOString();instance.pid=result.pid;instance.tokenUsage=parsed.usage;usageAdd(job.tokenUsage,parsed.usage);
  await jobs.artifact(job,`${roleName.toLowerCase()}-output`,parsed.final||result.stdout||result.stderr,{agentInstanceId:instance.id});await jobs.event(job,"AGENT_FINISHED",{agentInstanceId:instance.id,role:roleName,status:instance.status,exitCode:result.code,usage:parsed.usage});
  if(result.cancelled)throw Object.assign(new Error("JOB_CANCELLED"),{code:"JOB_CANCELLED"});if(result.code!==0)throw Object.assign(new Error(`${roleName}_CODEX_FAILED`),{code:`${roleName}_CODEX_FAILED`});return parsed.final;
}

async function diffArtifact(job) {
  const status=git(job,["status","--short","--untracked-files=all"]);const paths=status.stdout.split("\n").filter(Boolean).map((line)=>line.slice(3).split(" -> ").at(-1));const diff=git(job,["diff","--no-ext-diff","--"]);let text=`STATUS\n${status.stdout}\nDIFF\n${diff.stdout}`;
  for(const path of paths.filter((path)=>status.stdout.split("\n").some((line)=>line.startsWith("?? ")&&line.slice(3)===path))){try{text+=`\nUNTRACKED ${path}\n${(await readFile(resolve(job.projectRoot,path),"utf8")).slice(0,100000)}`;}catch{}}
  job.changedPaths=paths;await jobs.artifact(job,"implementation-diff",text,{changedPaths:paths});return text;
}

async function runAcceptance(job) {
  job.stage="VALIDATING";const results=[];
  for(const line of job.acceptanceCommands){const [command,...args]=line.split(" ");const out=await runProcess(command,args,{cwd:job.projectRoot,jobId:job.id,timeoutMs:20*60*1000,onChunk:async(stream,value)=>jobs.event(job,"VALIDATION_LOG",{command:line,stream,message:value.slice(0,2000)})});results.push({command:line,status:out.code,output:`${out.stdout}${out.stderr}`.slice(-12000)});if(out.cancelled)throw Object.assign(new Error("JOB_CANCELLED"),{code:"JOB_CANCELLED"});}
  job.validation={status:results.every((item)=>item.status===0)?"PASS":"FAIL",checks:results};job.validationHistory??=[];job.validationHistory.push({...job.validation,attempt:job.repairAttemptsUsed,at:new Date().toISOString()});await jobs.artifact(job,"validation-results",JSON.stringify(job.validation,null,2),{attempt:job.repairAttemptsUsed});await jobs.save(job);return job.validation;
}

async function governedAttempt(job,{instruction,attemptKind,expectedBaselineDigest=null,index=0}) {
  job.stage=attemptKind==="REPAIR"?"REPAIRING":"IMPLEMENTING";
  const roleName=attemptKind==="REPAIR"?"REPAIRER":"IMPLEMENTER";
  const instance={id:`${job.id}-${roleName.toLowerCase()}-${index+1}`,role:roleName,status:"RUNNING",runtimeType:"CODEX",model:"codex-default",skillPack:["software_delivery"],startedAt:new Date().toISOString(),finishedAt:null,pid:null,supervisorPid:null,tokenUsage:null};job.agentInstances.push(instance);await jobs.event(job,"AGENT_STARTED",{agentInstanceId:instance.id,role:roleName,attemptKind,index});
  const config={runKey:`${job.id}-${attemptKind.toLowerCase()}-${index+1}`,projectId:job.projectId,projectRoot:job.projectRoot,goal:job.goal,instruction:policySafeInstruction(instruction),allowedPaths:job.allowedPaths,targetPaths:job.allowedPaths,blockedPaths:job.blockedPaths,acceptanceCommands:job.acceptanceCommands,maxRuntimeSeconds:job.maxRuntimeSeconds,credentialReferenceId:job.credentialReferenceId,policyVersion:`${job.id}-${attemptKind.toLowerCase()}-${index+1}-v1`,attemptKind,expectedBaselineDigest};
  const configPath=resolve(jobs.artifactDir(job.id),`governed-config-${attemptKind.toLowerCase()}-${index+1}.json`);await writeFile(configPath,`${JSON.stringify(config,null,2)}\n`,"utf8");
  const result=await runProcess(process.execPath,[resolve(repoRoot,"packages/orchestrator-core/bin/governed-codex-run.mjs"),configPath],{cwd:repoRoot,jobId:job.id,timeoutMs:(job.maxRuntimeSeconds+180)*1000,onChunk:async(stream,value,pid)=>{instance.supervisorPid=pid;await jobs.heartbeat(worker,job.id);await jobs.event(job,"AGENT_LOG",{agentInstanceId:instance.id,stream,message:value.slice(0,2000)});}});
  const parsed=parseCodex(result.stdout);instance.status=result.code===0?"SUCCEEDED":result.cancelled?"CANCELLED":"FAILED";instance.finishedAt=new Date().toISOString();instance.pid=parsed.report?.codexEvidence?.pid??instance.supervisorPid;instance.tokenUsage=parsed.usage;usageAdd(job.tokenUsage,parsed.usage);await jobs.artifact(job,`${roleName.toLowerCase()}-output`,result.stdout||result.stderr,{agentInstanceId:instance.id,attemptKind,index});await jobs.event(job,"AGENT_FINISHED",{agentInstanceId:instance.id,role:roleName,status:instance.status,exitCode:result.code,pid:instance.pid,usage:instance.tokenUsage});
  return {...result,parsed,stopped:parseStopped(result.stderr)};
}

async function execute(job) {
  try {
    if(job.approvalScopeDigest!==approvalScopeDigest(job.approvalScope))throw Object.assign(new Error("APPROVAL_SCOPE_CHANGED"),{code:"APPROVAL_SCOPE_CHANGED"});
    if(!job.approvalExpiresAt||new Date(job.approvalExpiresAt).getTime()<=Date.now())throw Object.assign(new Error("JOB_APPROVAL_EXPIRED"),{code:"JOB_APPROVAL_EXPIRED"});
    assertWorkspaceWithinScope(captureGitWorkspace(job.projectRoot),job.allowedPaths);
    const plannerPrompt=`You are the PLANNER agent in an autonomous development pipeline. Inspect the repository read-only. Produce a concise implementation plan for this goal. Do not modify files. Goal: ${job.goal}\nAllowed paths: ${job.allowedPaths.join(", ")}\nAcceptance criteria: ${job.acceptanceCriteria.join("; ")}\nClarification: ${job.clarification.answer||"none"}`;
    const plan=await role(job,"PLANNER",plannerPrompt);
    const implementationInstruction=`Implement the approved goal. Follow this planner artifact:\n${plan}\nAcceptance criteria:\n- ${job.acceptanceCriteria.join("\n- ")}\nModify only allowed paths: ${job.allowedPaths.join(", ")}`;
    let attempt=await governedAttempt(job,{instruction:implementationInstruction,attemptKind:"IMPLEMENT",index:0});
    const fingerprints=[];
    while(attempt.code!==0){
      if(attempt.cancelled)throw Object.assign(new Error("JOB_CANCELLED"),{code:"JOB_CANCELLED"});
      const repairable=["ACCEPTANCE_FAILED","GIT_DIFF_CHECK_FAILED"].some((code)=>String(attempt.stopped?.code??"").startsWith(code));
      if(!repairable)throw Object.assign(new Error(attempt.stopped?.code??"IMPLEMENTER_CODEX_FAILED"),{code:attempt.stopped?.code??"IMPLEMENTER_CODEX_FAILED"});
      const validation=await runAcceptance(job);const decision=repairDecision({validation,previousFingerprints:fingerprints,repairsUsed:job.repairAttemptsUsed,maxRepairAttempts:job.maxRepairAttempts});await jobs.event(job,"REPAIR_DECISION",decision);
      if(decision.action!=="REPAIR"){job.status="NEEDS_REWORK";job.review={decision:"REWORK_REQUIRED",summary:decision.reason};await jobs.recordDelivery(job);await jobs.event(job,"JOB_EXECUTION_FINISHED",{status:job.status,reviewDecision:job.review.decision});return;}
      fingerprints.push(decision.fingerprint);job.repairAttemptsUsed+=1;const snapshot=assertWorkspaceWithinScope(captureGitWorkspace(job.projectRoot),job.allowedPaths);
      const failures=validation.checks.filter((check)=>check.status!==0).map((check)=>`${check.command}\n${check.output}`).join("\n\n");
      const repairInstruction=`Repair the existing approved implementation without reverting valid work. Stay inside the approved paths. Goal: ${job.goal}\nAcceptance criteria:\n- ${job.acceptanceCriteria.join("\n- ")}\nFailing validation evidence:\n${failures.slice(0,30000)}`;
      attempt=await governedAttempt(job,{instruction:repairInstruction,attemptKind:"REPAIR",expectedBaselineDigest:snapshot.digest,index:job.repairAttemptsUsed});
    }
    const diff=await diffArtifact(job);const validation=await runAcceptance(job);
    const validator=await role(job,"VALIDATOR",`You are an independent VALIDATOR agent. Review this implementation read-only. Goal: ${job.goal}\nAcceptance: ${job.acceptanceCriteria.join("; ")}\nValidation: ${JSON.stringify(validation)}\nDiff:\n${diff.slice(0,60000)}\nReturn PASS or FAIL with reasons.`);
    const review=await role(job,"REVIEWER",`You are an independent REVIEWER agent. Decide whether this job is ready for human diff approval. Do not modify files. Goal: ${job.goal}\nAcceptance: ${job.acceptanceCriteria.join("; ")}\nPlanner: ${plan.slice(0,12000)}\nValidator: ${validator.slice(0,12000)}\nChanged paths: ${job.changedPaths.join(", ")}\nRespond with READY_FOR_HUMAN_APPROVAL or REWORK_REQUIRED and reasons.`);
    job.review={decision:/READY_FOR_HUMAN_APPROVAL/i.test(review)&&validation.status==="PASS"?"READY_FOR_HUMAN_APPROVAL":"REWORK_REQUIRED",summary:review};job.status=job.review.decision==="READY_FOR_HUMAN_APPROVAL"?"AWAITING_DIFF_APPROVAL":"NEEDS_REWORK";job.stage="DELIVERY";job.finishedAt=new Date().toISOString();await jobs.recordDelivery(job);await jobs.event(job,"JOB_EXECUTION_FINISHED",{status:job.status,reviewDecision:job.review.decision});
  } catch(error) {
    if(error.code==="JOB_CANCELLED"){job.status="CANCELLED";job.stage="CANCELLED";job.finishedAt=new Date().toISOString();await jobs.event(job,"JOB_CANCELLED_BY_WORKER",{at:job.finishedAt});return;}
    job.status="FAILED";job.error={code:error.code||error.message,message:error.message,at:new Date().toISOString()};job.finishedAt=new Date().toISOString();await jobs.recordDelivery(job);await jobs.event(job,"JOB_FAILED",job.error);
  }
}

await jobs.reconcileOrphanedJobs();
console.log(`Autonomous development worker ${worker.id} pid=${worker.pid}`);
const heartbeatTimer=setInterval(()=>jobs.heartbeat(worker,currentJobId).catch(()=>{}),5000);heartbeatTimer.unref();
while(!stopping){await jobs.heartbeat(worker,currentJobId);const job=await jobs.claim(worker);if(job){currentJobId=job.id;await jobs.heartbeat(worker,currentJobId);await execute(job);currentJobId=null;await jobs.heartbeat(worker);}await sleep(1500);}
clearInterval(heartbeatTimer);await jobs.heartbeat({...worker,id:worker.id});
