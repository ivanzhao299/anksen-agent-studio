import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const libDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(libDir, "..");

const paths = {
  credentials: resolve(packageRoot, "examples/credential-references.example.json"),
  policy: resolve(packageRoot, "examples/vault-policy.example.json"),
  backendPolicy: resolve(packageRoot, "examples/backend-policy.example.json"),
  backendSelection: resolve(packageRoot, "examples/backend-selection.example.json"),
  credentialScope: resolve(packageRoot, "examples/credential-scope.example.json")
};

const forbiddenFieldNames = new Set(["api_key", "secret", "token", "password", "private_key", "ssh_key"]);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadCredentialVault() {
  const [credentials, policy, backendPolicy, backendSelectionExample, credentialScopeExample] = await Promise.all([
    readJson(paths.credentials),
    readJson(paths.policy),
    readJson(paths.backendPolicy),
    readJson(paths.backendSelection),
    readJson(paths.credentialScope)
  ]);
  return {
    credentials,
    policy,
    backendPolicy,
    backendSelectionExample,
    credentialScopeExample,
    paths
  };
}

function stableId(parts) {
  return createHash("sha1").update(parts.join(":")).digest("hex").slice(0, 10);
}

function hasForbiddenField(value, path = []) {
  if (!value || typeof value !== "object") return [];
  const findings = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (forbiddenFieldNames.has(key)) {
      findings.push({
        severity: "BLOCKER",
        path: childPath.join("."),
        message: `Forbidden secret field present: ${key}`
      });
    }
    findings.push(...hasForbiddenField(child, childPath));
  }
  return findings;
}

function referenceValue(credential) {
  const reference = credential.reference ?? {};
  return reference.vault_path ?? reference.env_ref ?? reference.keychain_ref ?? reference.external_vault_ref ?? "";
}

export function credentialInventory(vault) {
  return (vault.credentials.credential_references ?? []).map((credential) => ({
    credential_id: credential.credential_id,
    provider: credential.provider,
    credential_type: credential.credential_type,
    reference_type: credential.reference?.reference_type ?? "unknown",
    reference_value: referenceValue(credential),
    status: credential.status,
    secret_value_read: "no"
  }));
}

export function validateCredentialVault(vault) {
  const findings = [];
  const credentials = vault.credentials.credential_references ?? [];
  const policy = vault.policy;
  const allowedReferenceTypes = new Set(policy.allowed_reference_types ?? []);
  const ids = new Set();
  const providers = new Set();

  findings.push(...hasForbiddenField(vault.credentials));

  for (const credential of credentials) {
    if (ids.has(credential.credential_id)) {
      findings.push({
        severity: "ERROR",
        credential_id: credential.credential_id,
        message: "Duplicate credential_id"
      });
    }
    ids.add(credential.credential_id);

    if (providers.has(credential.provider)) {
      findings.push({
        severity: "WARN",
        credential_id: credential.credential_id,
        provider: credential.provider,
        message: "Multiple credential references for the same provider; Runtime Center uses first provider match in MVP."
      });
    }
    providers.add(credential.provider);

    const referenceType = credential.reference?.reference_type;
    if (!allowedReferenceTypes.has(referenceType)) {
      findings.push({
        severity: "ERROR",
        credential_id: credential.credential_id,
        message: `Reference type is not allowed by policy: ${referenceType}`
      });
    }

    if (!referenceValue(credential)) {
      findings.push({
        severity: "ERROR",
        credential_id: credential.credential_id,
        message: "Credential reference has no reference value"
      });
    }
  }

  const hardFailures = findings.filter((finding) => ["ERROR", "BLOCKER"].includes(finding.severity));
  return {
    status: hardFailures.length === 0 ? "PASS" : "FAIL",
    credential_count: credentials.length,
    provider_count: providers.size,
    findings,
    secret_values_read: "no",
    env_read: "no",
    keychain_read: "no",
    external_vault_read: "no"
  };
}

export function policySummary(vault) {
  return {
    secret_values: vault.policy.secret_values,
    env_read: vault.policy.env_read,
    keychain_read: vault.policy.keychain_read,
    external_vault_read: vault.policy.external_vault_read,
    allowed_reference_types: vault.policy.allowed_reference_types ?? [],
    forbidden_fields: vault.policy.forbidden_fields ?? [],
    runtime_health_secret_access: vault.policy.runtime_health_secret_access
  };
}

export function backendInventory(vault) {
  return (vault.backendPolicy.backends ?? []).map((backend) => ({
    backend_id: backend.backend_id,
    display_name: backend.display_name,
    reference_type: backend.reference_type,
    supported_environments: backend.supported_environments ?? [],
    risk: backend.risk,
    execution_mode: backend.execution_mode,
    approval_required: Boolean(backend.approval_required),
    secret_values_read: "no",
    external_connection: backend.external_connection
  }));
}

export function backendGovernance(backend) {
  if (!backend) {
    return {
      risk: "CRITICAL",
      execution_mode: "human_approval_required",
      approval_required: true,
      proposal_required: true,
      reason: "Credential backend is not registered."
    };
  }
  if ((backend.supported_environments ?? []).includes("production")) {
    return {
      risk: "CRITICAL",
      execution_mode: "human_approval_required",
      approval_required: true,
      proposal_required: true,
      reason: "Production credentials require CRITICAL approval."
    };
  }
  if (backend.backend_id === "ssh-agent-ref" || backend.backend_id === "external-vault-ref" || backend.backend_id === "cloud-secret-manager-ref") {
    return {
      risk: "HIGH",
      execution_mode: "proposal_only",
      approval_required: true,
      proposal_required: true,
      reason: `${backend.backend_id} is HIGH risk and proposal-only in Pilot-3.`
    };
  }
  return {
    risk: backend.risk,
    execution_mode: backend.execution_mode,
    approval_required: Boolean(backend.approval_required),
    proposal_required: false,
    reason: "Reference-only local credential backend is available for dry-run policy selection."
  };
}

export function selectBackend(vault, backendId) {
  const backend = (vault.backendPolicy.backends ?? []).find((item) => item.backend_id === backendId) ?? null;
  const governance = backendGovernance(backend);
  const blockedReasons = [];
  if (!backend) blockedReasons.push(`Credential backend not found: ${backendId}.`);
  const status = !backend
    ? "BLOCKED"
    : governance.proposal_required || governance.approval_required
      ? "PROPOSAL_ONLY"
      : "SELECTED";
  return {
    schema_version: 1,
    selection_id: `select-${stableId([backendId, new Date().toISOString()])}`,
    backend_id: backendId,
    status,
    dry_run: true,
    risk: governance.risk,
    execution_mode: governance.execution_mode,
    secret_values_read: "no",
    env_read: "no",
    keychain_read: "no",
    external_vault_read: "no",
    ssh_agent_read: "no",
    external_connection: "disabled",
    approval_required: governance.approval_required,
    proposal_required: governance.proposal_required,
    blocked_reasons: blockedReasons,
    notes: governance.reason
  };
}

export function scopeCheck(vault, runtimeId) {
  const scopes = vault.backendPolicy.credential_scopes ?? [];
  const scope = scopes.find((item) => item.runtime_id === runtimeId) ?? null;
  const credential = (vault.credentials.credential_references ?? [])
    .find((item) => item.credential_id === scope?.credential_reference_id) ?? null;
  const findings = [];
  if (!scope) findings.push(`No credential scope policy found for runtime ${runtimeId}.`);
  if (scope && !credential) findings.push(`Credential reference not found: ${scope.credential_reference_id}.`);
  if (scope?.production_allowed) findings.push(`Runtime ${runtimeId} unexpectedly allows production credentials in Pilot-3.`);
  return {
    schema_version: 1,
    runtime_id: runtimeId,
    credential_reference_id: scope?.credential_reference_id ?? "",
    status: findings.length === 0 ? "PASS" : "FAIL",
    dry_run: true,
    scope: scope ? {
      environment: scope.environment,
      allowed_backends: scope.allowed_backends ?? [],
      production_allowed: scope.production_allowed,
      scope_notes: scope.scope_notes
    } : {},
    credential_status: credential?.status ?? "missing",
    credential_reference_type: credential?.reference?.reference_type ?? "missing",
    secret_values_read: "no",
    env_read: "no",
    keychain_read: "no",
    external_vault_read: "no",
    ssh_agent_read: "no",
    external_connection: "disabled",
    findings
  };
}

export function auditPolicySummary(vault) {
  return {
    policy_id: vault.backendPolicy.policy_id,
    environment_separation: vault.backendPolicy.environment_separation ?? [],
    rotation_policy: vault.backendPolicy.rotation_policy,
    audit_policy: vault.backendPolicy.audit_policy,
    approval_policy: vault.backendPolicy.approval_policy,
    secret_values_read: "no",
    env_read: "no",
    keychain_read: "no",
    external_vault_read: "no",
    ssh_agent_read: "no",
    external_connection: "disabled"
  };
}

export function validateBackendPolicy(vault) {
  const findings = [];
  const backendIds = new Set();
  findings.push(...hasForbiddenField(vault.backendPolicy));
  for (const backend of vault.backendPolicy.backends ?? []) {
    if (backendIds.has(backend.backend_id)) {
      findings.push({ severity: "ERROR", message: `Duplicate backend_id: ${backend.backend_id}` });
    }
    backendIds.add(backend.backend_id);
    const governance = backendGovernance(backend);
    if (backend.backend_id === "local-env-ref" && governance.risk !== "MEDIUM") {
      findings.push({ severity: "ERROR", message: "local-env-ref must be MEDIUM risk." });
    }
    if (backend.backend_id === "macos-keychain-ref" && governance.risk !== "MEDIUM") {
      findings.push({ severity: "ERROR", message: "macos-keychain-ref must be MEDIUM risk." });
    }
    if (["ssh-agent-ref", "external-vault-ref", "cloud-secret-manager-ref"].includes(backend.backend_id) && governance.execution_mode !== "proposal_only") {
      findings.push({ severity: "ERROR", message: `${backend.backend_id} must be proposal_only.` });
    }
    if (backend.secret_read !== "forbidden") {
      findings.push({ severity: "BLOCKER", message: `${backend.backend_id} must forbid secret reads.` });
    }
    if (backend.external_connection !== "disabled") {
      findings.push({ severity: "BLOCKER", message: `${backend.backend_id} must disable external connections in Pilot-3.` });
    }
  }
  for (const requiredId of ["local-env-ref", "macos-keychain-ref", "external-vault-ref", "cloud-secret-manager-ref", "ssh-agent-ref"]) {
    if (!backendIds.has(requiredId)) {
      findings.push({ severity: "ERROR", message: `Missing credential backend: ${requiredId}` });
    }
  }
  const hardFailures = findings.filter((finding) => ["ERROR", "BLOCKER"].includes(finding.severity));
  return {
    status: hardFailures.length === 0 ? "PASS" : "FAIL",
    backend_count: vault.backendPolicy.backends?.length ?? 0,
    scope_count: vault.backendPolicy.credential_scopes?.length ?? 0,
    findings,
    secret_values_read: "no",
    env_read: "no",
    keychain_read: "no",
    external_vault_read: "no",
    ssh_agent_read: "no"
  };
}
