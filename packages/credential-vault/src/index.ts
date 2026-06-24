export type SecretReferenceType = "vault_path" | "env_ref" | "keychain_ref" | "external_vault_ref";

export type CredentialType = "api_key_ref" | "oauth_ref" | "local_login_ref" | "ssh_ref" | "none";
export type CredentialBackendId = "local-env-ref" | "macos-keychain-ref" | "external-vault-ref" | "cloud-secret-manager-ref" | "ssh-agent-ref";
export type CredentialEnvironment = "local" | "staging" | "production";
export type CredentialRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type CredentialBackendMode = "reference_only" | "proposal_only" | "human_approval_required";

export interface SecretReference {
  readonly reference_type: SecretReferenceType;
  readonly vault_path?: string;
  readonly env_ref?: string;
  readonly keychain_ref?: string;
  readonly external_vault_ref?: string;
}

export interface CredentialReference {
  readonly credential_id: string;
  readonly provider: string;
  readonly credential_type: CredentialType;
  readonly reference: SecretReference;
  readonly status: "reference_only" | "missing" | "disabled" | "not_required";
}

export interface VaultPolicy {
  readonly secret_values: "forbidden";
  readonly env_read: "forbidden";
  readonly keychain_read: "forbidden";
  readonly external_vault_read: "forbidden";
  readonly allowed_reference_types: readonly SecretReferenceType[];
}

export interface CredentialBackendPolicyEntry {
  readonly backend_id: CredentialBackendId;
  readonly display_name: string;
  readonly reference_type: "env_ref" | "keychain_ref" | "external_vault_ref" | "ssh_agent_ref";
  readonly supported_environments: readonly CredentialEnvironment[];
  readonly risk: CredentialRisk;
  readonly execution_mode: CredentialBackendMode;
  readonly secret_read: "forbidden";
  readonly external_connection: "disabled";
  readonly approval_required: boolean;
}

export interface CredentialScopePolicy {
  readonly runtime_id: string;
  readonly credential_reference_id: string;
  readonly environment: CredentialEnvironment;
  readonly allowed_backends: readonly CredentialBackendId[];
  readonly production_allowed: boolean;
}

export interface CredentialBackendPolicy {
  readonly schema_version: number;
  readonly policy_id: string;
  readonly secret_values: "forbidden";
  readonly environment_separation: readonly CredentialEnvironment[];
  readonly backends: readonly CredentialBackendPolicyEntry[];
  readonly credential_scopes: readonly CredentialScopePolicy[];
}

export const credentialVaultVersion = "0.1.0";
