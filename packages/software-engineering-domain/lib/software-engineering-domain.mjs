import { createHash } from "node:crypto";
import { RulePlannerEngine } from "../../planning-center/lib/planner-service.mjs";

const risks = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const safeId = /^[a-z0-9][a-z0-9._-]+$/i;
const shellSyntax = /[;&|`]|$\(/;
const validationCommandAllowlist = [
  /^git diff --check$/,
  /^git status --short$/,
  /^pnpm (?:--filter [@a-z0-9_./-]+ )?(?:test|typecheck|build|lint(?::check)?)$/i,
  /^npm test$/,
  /^node --test(?: [a-z0-9_./*?-]+)?$/i
];
const secretPath = /(^|\/)(?:\.env(?:\.|$)|\.git(?:\/|$)|\.ssh(?:\/|$)|node_modules(?:\/|$))/i;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex").slice(0, 16);
const nonEmptyStrings = value => Array.isArray(value) && value.length > 0 && value.every(item => typeof item === "string" && item.trim()) && new Set(value).size === value.length;

export class SoftwareEngineeringDomainError extends Error {
  constructor(code, message = code) { super(message); this.name = "SoftwareEngineeringDomainError"; this.code = code; }
}

export function validateSoftwareEngineeringContract(input) {
  const contract = structuredClone(input ?? {});
  if (contract.schemaVersion !== 1 || contract.domain !== "SOFTWARE_ENGINEERING" || !safeId.test(contract.contractId ?? "")) throw new SoftwareEngineeringDomainError("CONTRACT_IDENTITY_INVALID");
  if (typeof contract.objective !== "string" || !contract.objective.trim() || typeof contract.projectRootReference !== "string" || !contract.projectRootReference.trim()) throw new SoftwareEngineeringDomainError("CONTRACT_OBJECTIVE_INVALID");
  for (const field of ["allowedPaths", "blockedPaths", "constraints", "acceptanceCriteria", "validationCommands", "expectedArtifacts"]) if (!nonEmptyStrings(contract[field])) throw new SoftwareEngineeringDomainError("CONTRACT_FIELD_INVALID", field);
  if (!risks.has(contract.riskLevel) || !Number.isInteger(contract.maxAttempts) || contract.maxAttempts < 1 || contract.maxAttempts > 3) throw new SoftwareEngineeringDomainError("CONTRACT_LIMIT_INVALID");
  if (contract.allowedPaths.some(path => path.startsWith("/") || path.includes("..") || secretPath.test(path))) throw new SoftwareEngineeringDomainError("ALLOWED_PATH_INVALID");
  if (contract.blockedPaths.some(path => path.startsWith("/") || path.includes(".."))) throw new SoftwareEngineeringDomainError("BLOCKED_PATH_INVALID");
  if (contract.allowedPaths.some(path => contract.blockedPaths.some(blocked => path === blocked || path.startsWith(`${blocked}/`)))) throw new SoftwareEngineeringDomainError("PATH_POLICY_CONFLICT");
  if (contract.validationCommands.some(command => shellSyntax.test(command) || !validationCommandAllowlist.some(pattern => pattern.test(command)))) throw new SoftwareEngineeringDomainError("VALIDATION_COMMAND_DENIED");
  if (contract.riskLevel === "CRITICAL" && !contract.constraints.some(value => /human approval|人工审批/i.test(value))) throw new SoftwareEngineeringDomainError("CRITICAL_APPROVAL_REQUIRED");
  return Object.freeze(contract);
}

export class SoftwareEngineeringPlanner {
  constructor({ kernel, engine = new RulePlannerEngine() } = {}) {
    if (!kernel?.submitPlan) throw new SoftwareEngineeringDomainError("KERNEL_REQUIRED");
    this.kernel = kernel;
    this.engine = engine;
  }

  plan(contractInput, { goalId = contractInput.contractId, now = new Date() } = {}) {
    const contract = validateSoftwareEngineeringContract(contractInput);
    const base = this.engine.createGraph({ id: goalId, title: `Build feature: ${contract.objective}`, description: contract.objective, metadata: { riskLevel: contract.riskLevel, constraints: contract.constraints, acceptanceCriteria: contract.acceptanceCriteria } }, { now });
    const tasks = base.tasks.map(task => ({
      ...task,
      maxAttempts: contract.maxAttempts,
      description: `${task.title}: ${contract.objective}`,
      metadata: { ...task.metadata, domain: contract.domain, contractId: contract.contractId, projectRootReference: contract.projectRootReference, allowedPaths: contract.allowedPaths, blockedPaths: contract.blockedPaths, validationCommands: contract.validationCommands, expectedArtifacts: contract.expectedArtifacts }
    }));
    return { ...base, plannerVersion: `software-engineering-v1-${digest({ contract, tasks, dependencies: base.dependencies })}`, tasks, metadata: { ...base.metadata, domain: contract.domain, domainContractVersion: 1, contractId: contract.contractId } };
  }

  async planAndSubmit(contract, options) {
    const graph = this.plan(contract, options);
    const submission = await this.kernel.submitPlan(graph.goalId, { plannerVersion: graph.plannerVersion, sourceArtifactRef: `domain-contract:${contract.contractId}`, tasks: graph.tasks, dependencies: graph.dependencies });
    return { graph, submission };
  }
}

const pathAllowed = (path, allowed) => allowed.some(base => path === base || path.startsWith(`${base.replace(/\/$/, "")}/`));

export function evaluateSoftwareEngineeringAcceptance(contractInput, execution = {}) {
  const contract = validateSoftwareEngineeringContract(contractInput);
  const changedPaths = [...new Set(execution.changedPaths ?? [])].sort();
  const validations = execution.validationResults ?? [];
  const artifacts = execution.artifacts ?? [];
  const findings = [];
  let blocked = false;
  for (const path of changedPaths) if (!pathAllowed(path, contract.allowedPaths) || contract.blockedPaths.some(base => path === base || path.startsWith(`${base}/`))) { findings.push(`PATH_DENIED:${path}`); blocked = true; }
  if (execution.attemptCount > contract.maxAttempts) { findings.push("MAX_ATTEMPTS_EXCEEDED"); blocked = true; }
  if (execution.sideEffects?.some(effect => !["workspace_write"].includes(effect))) { findings.push("UNAPPROVED_SIDE_EFFECT"); blocked = true; }
  for (const command of contract.validationCommands) {
    const result = validations.find(item => item.command === command);
    if (!result) findings.push(`VALIDATION_MISSING:${command}`);
    else if (result.status !== 0) findings.push(`VALIDATION_FAILED:${command}`);
  }
  for (const artifact of contract.expectedArtifacts) if (!artifacts.includes(artifact)) findings.push(`ARTIFACT_MISSING:${artifact}`);
  for (const criterion of contract.acceptanceCriteria) if (!(execution.acceptanceCriteria ?? []).includes(criterion)) findings.push(`CRITERION_UNPROVEN:${criterion}`);
  return { schemaVersion: 1, contractId: contract.contractId, status: blocked ? "BLOCKED" : findings.length ? "FAIL" : "PASS", changedPaths, findings, evidence: { attemptCount: execution.attemptCount ?? 0, validationResults: validations, artifacts, acceptanceCriteria: execution.acceptanceCriteria ?? [], sideEffects: execution.sideEffects ?? [] } };
}
