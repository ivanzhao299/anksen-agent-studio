import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const defaultRegistryPath = new URL("../registry/professional-runner-capabilities.json", import.meta.url);
const defaultRulesPath = new URL("../registry/skill-router-rules.json", import.meta.url);
const unique = values => [...new Set(values)];
const safeVersion = output => String(output ?? "").split(/\r?\n/, 1)[0].slice(0, 160);
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const require=createRequire(import.meta.url);
const versionTuple=value=>(String(value).match(/\d+(?:\.\d+){0,2}/)?.[0]??"0").split(".").map(Number);
const versionAtLeast=(actual,minimum)=>{const a=versionTuple(actual),b=versionTuple(minimum);for(let i=0;i<3;i++){if((a[i]??0)>(b[i]??0))return true;if((a[i]??0)<(b[i]??0))return false;}return true;};

function findCommand(command, env) {
  for (const directory of String(env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = resolve(directory, command);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export class ProfessionalRunnerCapabilityRegistry {
  constructor({ registryPath = defaultRegistryPath, rulesPath = defaultRulesPath, skillsRoot = resolve(homedir(), ".codex/skills"), env = process.env, credentialReferenceIds = [], registeredAdapterIds = [] } = {}) {
    this.registryPath = registryPath;
    this.rulesPath = rulesPath;
    this.skillsRoot = skillsRoot;
    this.env = env;
    this.credentialReferenceIds = new Set(credentialReferenceIds);
    this.registeredAdapterIds = new Set(registeredAdapterIds);
  }

  async load() {
    const registry = JSON.parse(await readFile(this.registryPath, "utf8"));
    if (registry.schema_version !== 1 || !Array.isArray(registry.profiles)) throw Object.assign(new Error("PROFESSIONAL_RUNNER_REGISTRY_INVALID"), { code: "PROFESSIONAL_RUNNER_REGISTRY_INVALID" });
    return registry;
  }

  probeTool(dependency) {
    const path = findCommand(dependency.command, this.env);
    if (!path) return { command: dependency.command, status: "MISSING", version: null };
    const result = spawnSync(path, dependency.version_args ?? ["--version"], { encoding: "utf8", timeout: 5000, env: { PATH: this.env.PATH ?? "" } });
    const version=safeVersion(result.stdout||result.stderr)||null,status=result.status!==0?"UNHEALTHY":dependency.minimum_version&&!versionAtLeast(version,dependency.minimum_version)?"VERSION_UNSUPPORTED":"PASS";return { command: dependency.command, status, version, minimum_version:dependency.minimum_version??null };
  }

  probeSkill(skill) {
    const path = resolve(this.skillsRoot, skill, "SKILL.md");
    return { skill, status: existsSync(path) ? "PASS" : "MISSING", reference: existsSync(path) ? `skill://${skill}` : null };
  }

  probePackage(dependency){try{const manifest=require(`${dependency.name}/package.json`),version=manifest.version??null,status=dependency.minimum_version&&!versionAtLeast(version,dependency.minimum_version)?"VERSION_UNSUPPORTED":"PASS";return{name:dependency.name,status,version,minimum_version:dependency.minimum_version??null};}catch{return{name:dependency.name,status:"MISSING",version:null,minimum_version:dependency.minimum_version??null};}}

  async inventory() {
    const registry = await this.load();
    const profiles = registry.profiles.map(profile => {
      const tools = profile.tool_dependencies.map(item => this.probeTool(item));
      const skills = profile.skill_packages.map(item => this.probeSkill(item));
      const packages=(profile.package_dependencies??[]).map(item=>this.probePackage(item));
      const credentials = profile.credential_references.map(referenceId => ({ referenceId, status: this.credentialReferenceIds.has(referenceId) ? "REFERENCE_CONFIGURED" : "MISSING_REFERENCE" }));
      const blockedReasons = [
        ...tools.filter(item => item.status !== "PASS").map(item => `TOOL_${item.status}:${item.command}`),
        ...skills.filter(item => item.status !== "PASS").map(item => `SKILL_${item.status}:${item.skill}`),
        ...packages.filter(item=>item.status!=="PASS").map(item=>`PACKAGE_${item.status}:${item.name}`),
        ...credentials.filter(item => item.status !== "REFERENCE_CONFIGURED").map(item => `CREDENTIAL_REFERENCE_MISSING:${item.referenceId}`)
      ];
      const installationReadiness=blockedReasons.length?"NOT_READY":"READY",activationVariable=profile.activation?.environment_variable??null,activated=profile.activation?.required===false||Boolean(activationVariable&&this.env[activationVariable]==="true"),adapterRegistered=Boolean(profile.adapter_id&&this.registeredAdapterIds.has(profile.adapter_id)),executionBlocked=[...blockedReasons,...(activated?[]:[`RUNNER_NOT_ACTIVATED:${profile.profile_id}`]),...(adapterRegistered?[]:[`RUNTIME_ADAPTER_NOT_REGISTERED:${profile.adapter_id??profile.profile_id}`])];
      const evidence={profile_id:profile.profile_id,capability_version:profile.capability_version??"unversioned",tools,skills,packages,credentials,installation_readiness:installationReadiness,activated,adapterRegistered};
      return { ...profile, tools, skills, packages, credentials, readiness: installationReadiness, installation_readiness:installationReadiness, execution_readiness:executionBlocked.length?"NOT_EXECUTABLE":"EXECUTABLE", activated, adapter_registered:adapterRegistered, evidence_hash:hash(evidence), blocked_reasons: unique(blockedReasons), execution_blocked_reasons:unique(executionBlocked) };
    });
    return { schema_version: registry.schema_version, registry_id: registry.registry_id, checked_at: new Date().toISOString(), profiles, summary: { total: profiles.length, ready: profiles.filter(item => item.readiness === "READY").length, not_ready: profiles.filter(item => item.readiness !== "READY").length, executable:profiles.filter(item=>item.execution_readiness==="EXECUTABLE").length, not_activated:profiles.filter(item=>item.installation_readiness==="READY"&&item.execution_readiness!=="EXECUTABLE").length } };
  }

  async resolve(skillType) {
    const inventory = await this.inventory();
    const candidates = inventory.profiles.filter(profile => profile.skill_types.includes(skillType));
    const selected = candidates.find(profile => profile.readiness === "READY") ?? null;
    return { skill_type: skillType, status: selected ? "READY" : "BLOCKED", selected_profile_id: selected?.profile_id ?? null, candidates, blocked_reasons: selected ? [] : unique(candidates.flatMap(item => item.blocked_reasons).concat(candidates.length ? [] : [`NO_RUNNER_PROFILE:${skillType}`])) };
  }

  async preflight(request={}) {
    const inventory=await this.inventory(),profile=inventory.profiles.find(item=>item.profile_id===request.profileId);
    const reasons=[];if(!profile)reasons.push(`RUNNER_PROFILE_NOT_FOUND:${request.profileId}`);else{if(profile.execution_readiness!=="EXECUTABLE")reasons.push(...profile.execution_blocked_reasons);if(!profile.skill_types.includes(request.skillType))reasons.push(`SKILL_TYPE_MISMATCH:${request.skillType}`);if(request.workerProfileId&&request.workerProfileId!==profile.profile_id)reasons.push("WORKER_PROFILE_MISMATCH");if(!request.taskId)reasons.push("TASK_ID_REQUIRED");if(!request.attemptId)reasons.push("ATTEMPT_ID_REQUIRED");if(!request.fencingToken)reasons.push("FENCING_TOKEN_REQUIRED");if(!request.artifactRoot)reasons.push("ARTIFACT_ROOT_REQUIRED");else if(!profile.allowed_output_roots.some(root=>request.artifactRoot===root||request.artifactRoot.startsWith(`${root}/`)))reasons.push(`ARTIFACT_ROOT_BLOCKED:${request.artifactRoot}`);if(request.command&&!profile.allowed_commands.includes(request.command))reasons.push(`COMMAND_BLOCKED:${request.command}`);if(profile.risk_level==="HIGH"&&!request.approvalId)reasons.push("APPROVAL_REQUIRED");}
    return {status:reasons.length?"BLOCKED":"ALLOW",profile_id:profile?.profile_id??request.profileId,capability_version:profile?.capability_version??null,evidence_hash:profile?.evidence_hash??null,task_id:request.taskId??null,attempt_id:request.attemptId??null,blocked_reasons:unique(reasons),checked_at:new Date().toISOString()};
  }

  async matchTask(task={}) {
    const text=`${task.title??""} ${task.description??""} ${task.expectedOutputType??""}`.toLowerCase(),rules=JSON.parse(await readFile(this.rulesPath,"utf8")).rules??[],matches=rules.map(rule=>({...rule,matched_keywords:(rule.keywords??[]).filter(keyword=>text.includes(String(keyword).toLowerCase()))})).filter(rule=>rule.matched_keywords.length).sort((a,b)=>Number(b.confidence_boost??0)-Number(a.confidence_boost??0)||b.matched_keywords.length-a.matched_keywords.length),selectedRule=matches[0]??null;
    if(!selectedRule)return{status:"NO_MATCH",task_id:task.id??null,rule:null,capability:null};
    const inventory=await this.inventory(),candidates=inventory.profiles.filter(profile=>profile.skill_types.includes(selectedRule.skill_type)),selectedProfile=candidates.find(profile=>profile.execution_readiness==="EXECUTABLE")??candidates.find(profile=>profile.installation_readiness==="READY")??null;
    return{status:selectedProfile?selectedProfile.execution_readiness==="EXECUTABLE"?"EXECUTABLE_MATCH":"INSTALLED_MATCH":"BLOCKED",task_id:task.id??null,rule:{rule_id:selectedRule.rule_id,skill_type:selectedRule.skill_type,runtime:selectedRule.runtime,selected_agent:selectedRule.selected_agent,matched_keywords:selectedRule.matched_keywords},capability:selectedProfile?{profile_id:selectedProfile.profile_id,capability_version:selectedProfile.capability_version,installation_readiness:selectedProfile.installation_readiness,execution_readiness:selectedProfile.execution_readiness,evidence_hash:selectedProfile.evidence_hash,blocked_reasons:selectedProfile.execution_blocked_reasons}:null};
  }
}
