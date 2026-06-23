import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const libDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(libDir, "..");

const paths = {
  credentials: resolve(packageRoot, "examples/credential-references.example.json"),
  policy: resolve(packageRoot, "examples/vault-policy.example.json")
};

const forbiddenFieldNames = new Set(["api_key", "secret", "token", "password", "private_key", "ssh_key"]);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadCredentialVault() {
  const [credentials, policy] = await Promise.all([
    readJson(paths.credentials),
    readJson(paths.policy)
  ]);
  return {
    credentials,
    policy,
    paths
  };
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
