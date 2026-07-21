import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const defaultRegistryPath = new URL("../registry/professional-runner-capabilities.json", import.meta.url);
const unique = values => [...new Set(values)];
const safeVersion = output => String(output ?? "").split(/\r?\n/, 1)[0].slice(0, 160);

function findCommand(command, env) {
  for (const directory of String(env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = resolve(directory, command);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export class ProfessionalRunnerCapabilityRegistry {
  constructor({ registryPath = defaultRegistryPath, skillsRoot = resolve(homedir(), ".codex/skills"), env = process.env, credentialReferenceIds = [] } = {}) {
    this.registryPath = registryPath;
    this.skillsRoot = skillsRoot;
    this.env = env;
    this.credentialReferenceIds = new Set(credentialReferenceIds);
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
    return { command: dependency.command, status: result.status === 0 ? "PASS" : "UNHEALTHY", version: safeVersion(result.stdout || result.stderr) || null };
  }

  probeSkill(skill) {
    const path = resolve(this.skillsRoot, skill, "SKILL.md");
    return { skill, status: existsSync(path) ? "PASS" : "MISSING", reference: existsSync(path) ? `skill://${skill}` : null };
  }

  async inventory() {
    const registry = await this.load();
    const profiles = registry.profiles.map(profile => {
      const tools = profile.tool_dependencies.map(item => this.probeTool(item));
      const skills = profile.skill_packages.map(item => this.probeSkill(item));
      const credentials = profile.credential_references.map(referenceId => ({ referenceId, status: this.credentialReferenceIds.has(referenceId) ? "REFERENCE_CONFIGURED" : "MISSING_REFERENCE" }));
      const blockedReasons = [
        ...tools.filter(item => item.status !== "PASS").map(item => `TOOL_${item.status}:${item.command}`),
        ...skills.filter(item => item.status !== "PASS").map(item => `SKILL_${item.status}:${item.skill}`),
        ...credentials.filter(item => item.status !== "REFERENCE_CONFIGURED").map(item => `CREDENTIAL_REFERENCE_MISSING:${item.referenceId}`)
      ];
      return { ...profile, tools, skills, credentials, readiness: blockedReasons.length ? "NOT_READY" : "READY", blocked_reasons: unique(blockedReasons) };
    });
    return { schema_version: registry.schema_version, registry_id: registry.registry_id, checked_at: new Date().toISOString(), profiles, summary: { total: profiles.length, ready: profiles.filter(item => item.readiness === "READY").length, not_ready: profiles.filter(item => item.readiness !== "READY").length } };
  }

  async resolve(skillType) {
    const inventory = await this.inventory();
    const candidates = inventory.profiles.filter(profile => profile.skill_types.includes(skillType));
    const selected = candidates.find(profile => profile.readiness === "READY") ?? null;
    return { skill_type: skillType, status: selected ? "READY" : "BLOCKED", selected_profile_id: selected?.profile_id ?? null, candidates, blocked_reasons: selected ? [] : unique(candidates.flatMap(item => item.blocked_reasons).concat(candidates.length ? [] : [`NO_RUNNER_PROFILE:${skillType}`])) };
  }
}
