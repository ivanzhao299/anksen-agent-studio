export type SecretReferenceType = "vault_path" | "env_ref" | "keychain_ref" | "external_vault_ref";

export type CredentialType = "api_key_ref" | "oauth_ref" | "local_login_ref" | "ssh_ref" | "none";

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

export const credentialVaultVersion = "0.1.0";
