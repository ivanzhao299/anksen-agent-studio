import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const identifier = /^[a-z0-9][a-z0-9._-]{1,79}$/i;
const forbiddenPath = /(^|\/)(?:\.git(?:\/|$)|\.env(?:\.|$)|node_modules(?:\/|$)|\.ssh(?:\/|$)|Library\/Keychains(?:\/|$))/i;

export class GovernedCodexConfigError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "GovernedCodexConfigError";
    this.code = code;
  }
}

function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new GovernedCodexConfigError("CONFIG_INVALID", `${field} is required`);
  return value.trim();
}

function requireStringList(value, field) {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== "string" || !item.trim())) {
    throw new GovernedCodexConfigError("CONFIG_INVALID", `${field} must be a non-empty string array`);
  }
  return [...new Set(value.map(item => item.trim()))];
}

export function validateGovernedCodexConfig(input) {
  const config = structuredClone(input ?? {});
  config.runKey = requireString(config.runKey, "runKey");
  config.projectId = requireString(config.projectId, "projectId");
  config.goal = requireString(config.goal, "goal");
  config.instruction = requireString(config.instruction, "instruction");
  if (!identifier.test(config.runKey) || !identifier.test(config.projectId)) throw new GovernedCodexConfigError("CONFIG_INVALID", "runKey and projectId must be safe identifiers");

  const projectRoot = realpathSync(requireString(config.projectRoot, "projectRoot"));
  if (!isAbsolute(projectRoot)) throw new GovernedCodexConfigError("PROJECT_ROOT_INVALID");
  config.projectRoot = projectRoot;
  config.allowedPaths = requireStringList(config.allowedPaths, "allowedPaths");
  config.targetPaths = requireStringList(config.targetPaths ?? config.allowedPaths, "targetPaths");
  config.blockedPaths = requireStringList(config.blockedPaths, "blockedPaths");
  for (const path of [...config.allowedPaths, ...config.targetPaths]) {
    const absolute = resolve(projectRoot, path);
    const rel = relative(projectRoot, absolute);
    if (isAbsolute(path) || rel.startsWith("..") || isAbsolute(rel) || forbiddenPath.test(path)) {
      throw new GovernedCodexConfigError("PATH_POLICY_INVALID", path);
    }
  }
  if (!config.targetPaths.every(target => config.allowedPaths.some(allowed => target === allowed || target.startsWith(`${allowed}/`)))) {
    throw new GovernedCodexConfigError("TARGET_PATH_DENIED");
  }
  config.maxRuntimeSeconds = Number(config.maxRuntimeSeconds ?? 1800);
  if (!Number.isInteger(config.maxRuntimeSeconds) || config.maxRuntimeSeconds < 30 || config.maxRuntimeSeconds > 3600) {
    throw new GovernedCodexConfigError("RUNTIME_LIMIT_INVALID");
  }
  config.acceptanceCommands = requireStringList(config.acceptanceCommands ?? ["git diff --check"], "acceptanceCommands");
  const permittedChecks = [/^git status(?: --short)?$/, /^git diff(?: --check| --stat)?$/, /^pnpm (?:typecheck|build|test)(?:$| --)/];
  if (config.acceptanceCommands.some(command => !permittedChecks.some(pattern => pattern.test(command)))) {
    throw new GovernedCodexConfigError("ACCEPTANCE_COMMAND_DENIED");
  }
  config.policyVersion = requireString(config.policyVersion ?? `${config.runKey}-v1`, "policyVersion");
  config.credentialReferenceId = requireString(config.credentialReferenceId ?? "codex-local-session-ref", "credentialReferenceId");
  config.codexPath = config.codexPath ?? "/Applications/ChatGPT.app/Contents/Resources/codex";
  if (config.expectedBaselineDigest != null && !/^[0-9a-f]{64}$/.test(String(config.expectedBaselineDigest))) {
    throw new GovernedCodexConfigError("BASELINE_DIGEST_INVALID");
  }
  config.expectedBaselineDigest = config.expectedBaselineDigest ? String(config.expectedBaselineDigest) : null;
  config.attemptKind = config.attemptKind === "REPAIR" ? "REPAIR" : "IMPLEMENT";
  return Object.freeze(config);
}

export async function loadGovernedCodexConfig(path) {
  return validateGovernedCodexConfig(JSON.parse(await readFile(path, "utf8")));
}

export const governedCodexSafety = Object.freeze({
  maxAttempts: 1,
  allowCommit: false,
  allowPush: false,
  allowMerge: false,
  allowDeploy: false,
});
