import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { validateGovernedCodexConfig } from "./governed-codex-config.mjs";

const terminal = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "COMMITTED"]);
const safeId = value => String(value ?? "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 64);

export class AutonomousDevelopmentJobs {
  constructor({ repoRoot, storeDir = resolve(repoRoot, "runtime/autonomous-development"), clock = () => new Date() } = {}) {
    this.repoRoot = resolve(repoRoot);
    this.storeDir = storeDir;
    this.clock = clock;
  }
  jobPath(id) { return join(this.storeDir, "jobs", `${safeId(id)}.json`); }
  artifactDir(id) { return join(this.storeDir, "artifacts", safeId(id)); }
  heartbeatPath() { return join(this.storeDir, "worker-heartbeat.json"); }
  async save(job) { await mkdir(resolve(this.jobPath(job.id), ".."), { recursive: true }); job.updatedAt = this.clock().toISOString(); await writeFile(this.jobPath(job.id), `${JSON.stringify(job, null, 2)}\n`, "utf8"); return job; }
  async get(id) { return existsSync(this.jobPath(id)) ? JSON.parse(await readFile(this.jobPath(id), "utf8")) : null; }
  async list() { const dir = resolve(this.storeDir, "jobs"); if (!existsSync(dir)) return []; const files = (await readdir(dir)).filter(name => name.endsWith(".json")); const rows = await Promise.all(files.map(name => readFile(join(dir, name), "utf8").then(JSON.parse))); return rows.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))); }
  async event(job, type, payload = {}) { job.events.push({ sequence: job.events.length + 1, type, at: this.clock().toISOString(), ...payload }); return this.save(job); }
  async artifact(job, type, content, metadata = {}) { const id = `${String(job.artifacts.length + 1).padStart(3,"0")}-${safeId(type)}`; await mkdir(this.artifactDir(job.id), { recursive: true }); const path = join(this.artifactDir(job.id), `${id}.txt`); await writeFile(path, String(content ?? ""), "utf8"); const record = { id, type, path, createdAt: this.clock().toISOString(), ...metadata }; job.artifacts.push(record); await this.save(job); return record; }
  async readArtifact(jobId, artifactId) { const job=await this.get(jobId); const artifact=job?.artifacts.find(item=>item.id===artifactId); if(!artifact||!resolve(artifact.path).startsWith(resolve(this.artifactDir(jobId)))) return null; return { artifact, content: await readFile(artifact.path,"utf8") }; }
  async create(input, actor = {}) {
    const id = `dev-${Date.now()}-${randomUUID().slice(0,8)}`;
    const goal = String(input.goal ?? "").trim();
    const acceptanceCriteria = Array.isArray(input.acceptanceCriteria) ? input.acceptanceCriteria.map(String).map(v=>v.trim()).filter(Boolean) : String(input.acceptanceCriteria ?? "").split("\n").map(v=>v.trim()).filter(Boolean);
    const allowedPaths = Array.isArray(input.allowedPaths) ? input.allowedPaths : String(input.allowedPaths ?? "").split("\n").map(v=>v.trim()).filter(Boolean);
    const validation = validateGovernedCodexConfig({ runKey: id, projectId: safeId(input.projectId || "development-project"), projectRoot: input.projectRoot, goal, instruction: goal, allowedPaths, targetPaths: allowedPaths, blockedPaths: [".env", ".env.*", ".git", "node_modules", ".ssh", "deploy", "infra", "terraform"], acceptanceCommands: input.acceptanceCommands?.length ? input.acceptanceCommands : ["git diff --check"], maxRuntimeSeconds: Number(input.maxRuntimeSeconds ?? 1800), credentialReferenceId: "codex-local-session-ref", policyVersion: `${id}-v1` });
    const questions = [...(goal.length < 20 ? ["请补充更具体的预期结果和业务边界。"] : []), ...(acceptanceCriteria.length === 0 ? ["请至少提供一项可验证的验收标准。"] : [])];
    const job = { schemaVersion: 1, id, status: questions.length ? "NEEDS_CLARIFICATION" : "PENDING_APPROVAL", goal, projectId: validation.projectId, projectRoot: validation.projectRoot, allowedPaths: validation.allowedPaths, blockedPaths: validation.blockedPaths, acceptanceCommands: validation.acceptanceCommands, acceptanceCriteria, maxRuntimeSeconds: validation.maxRuntimeSeconds, credentialReferenceId: validation.credentialReferenceId, clarification: { questions, answer: null }, requestedBy: actor.userId ?? "unknown", approvedBy: null, approvedAt: null, workerId: null, workerPid: null, agentInstances: [], artifacts: [], events: [], tokenUsage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 }, changedPaths: [], validation: null, review: null, commit: null, error: null, createdAt: this.clock().toISOString(), updatedAt: this.clock().toISOString() };
    await this.event(job, "JOB_CREATED", { status: job.status });
    return job;
  }
  async clarify(id, answer, actor = {}) { const job=await this.get(id); if(!job) return null; if(job.status!=="NEEDS_CLARIFICATION") throw new Error("JOB_NOT_WAITING_FOR_CLARIFICATION"); if(!String(answer??"").trim()) throw new Error("CLARIFICATION_REQUIRED"); job.clarification.answer=String(answer).trim(); job.clarification.answeredBy=actor.userId??"unknown"; job.status="PENDING_APPROVAL"; return this.event(job,"CLARIFICATION_RECEIVED",{actorId:actor.userId??"unknown"}); }
  async approve(id, actor = {}) { const job=await this.get(id); if(!job) return null; if(!["PENDING_APPROVAL","PAUSED"].includes(job.status)) throw new Error("JOB_NOT_APPROVABLE"); job.status="QUEUED"; job.approvedBy=actor.userId??"unknown"; job.approvedAt=this.clock().toISOString(); return this.event(job,"JOB_APPROVED",{actorId:job.approvedBy}); }
  async pause(id, actor={}) { const job=await this.get(id); if(!job||terminal.has(job.status)) return job; job.status="PAUSED"; return this.event(job,"JOB_PAUSED",{actorId:actor.userId??"unknown"}); }
  async cancel(id, actor={}) { const job=await this.get(id); if(!job||terminal.has(job.status)) return job; job.status="CANCELLED"; return this.event(job,"JOB_CANCELLED",{actorId:actor.userId??"unknown"}); }
  async claim(worker) { for(const row of await this.list()){ if(row.status!=="QUEUED") continue; row.status="RUNNING"; row.workerId=worker.id; row.workerPid=worker.pid; row.startedAt=this.clock().toISOString(); await this.event(row,"WORKER_CLAIMED",{workerId:worker.id,pid:worker.pid}); return row;} return null; }
  async heartbeat(worker, currentJobId = null) { const value={workerId:worker.id,pid:worker.pid,status:currentJobId?"BUSY":"IDLE",currentJobId,lastHeartbeatAt:this.clock().toISOString(),runtimeType:"CODEX",realProcess:true}; await mkdir(this.storeDir,{recursive:true}); await writeFile(this.heartbeatPath(),`${JSON.stringify(value,null,2)}\n`,`utf8`); return value; }
  async workerStatus() { if(!existsSync(this.heartbeatPath())) return {status:"OFFLINE",reason:"NO_HEARTBEAT"}; const value=JSON.parse(await readFile(this.heartbeatPath(),"utf8")); const ageMs=this.clock().getTime()-new Date(value.lastHeartbeatAt).getTime(); return {...value,status:ageMs>15000?"OFFLINE":value.status,heartbeatAgeMs:Math.max(0,ageMs)}; }
  async approveCommit(id, actor={}) { const job=await this.get(id); if(!job) return null; if(job.status!=="AWAITING_DIFF_APPROVAL") throw new Error("JOB_NOT_READY_FOR_COMMIT"); const status=spawnSync("git",["-C",job.projectRoot,"status","--short","--untracked-files=all"],{encoding:"utf8"}); if(status.status!==0) throw new Error("GIT_STATUS_FAILED"); const paths=status.stdout.split("\n").filter(Boolean).map(line=>line.slice(3).split(" -> ").at(-1)); if(paths.some(path=>!job.allowedPaths.some(allowed=>path===allowed||path.startsWith(`${allowed.replace(/\/$/,"")}/`)))) throw new Error("COMMIT_PATH_DENIED"); const add=spawnSync("git",["-C",job.projectRoot,"add","--",...paths],{encoding:"utf8"}); if(add.status!==0) throw new Error("GIT_ADD_FAILED"); const commit=spawnSync("git",["-C",job.projectRoot,"commit","-m",`feat(autonomous): ${job.goal.slice(0,60)}`],{encoding:"utf8"}); if(commit.status!==0) throw new Error(commit.stderr||"GIT_COMMIT_FAILED"); const rev=spawnSync("git",["-C",job.projectRoot,"rev-parse","HEAD"],{encoding:"utf8"}); job.status="COMMITTED"; job.commit={hash:rev.stdout.trim(),approvedBy:actor.userId??"unknown",committedAt:this.clock().toISOString(),pushed:false}; return this.event(job,"COMMIT_APPROVED",job.commit); }
}
