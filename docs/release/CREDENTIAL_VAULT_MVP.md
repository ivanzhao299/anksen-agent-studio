# Credential Vault MVP

## Objective

Credential Vault establishes the reference and policy layer for future runtime providers such as OpenAI, Claude, Gemini, SSH workers, Aider, and local runtimes.

The MVP stores references only. It does not store, read, print, validate, or probe real secret values.

## Scope

Package:

```text
packages/credential-vault/
```

Schemas:

- `credential.schema.json`
- `secret-reference.schema.json`
- `vault-policy.schema.json`

Examples:

- `credential-references.example.json`
- `vault-policy.example.json`

CLI:

```bash
node packages/orchestrator-core/bin/studio.mjs credential list --dry-run
node packages/orchestrator-core/bin/studio.mjs credential validate --dry-run
node packages/orchestrator-core/bin/studio.mjs credential policy --dry-run
```

## Supported Reference Types

Credential Vault supports four reference forms:

- `vault_path`: internal vault path reference, such as `vault://agent-studio/openai/primary`
- `env_ref`: environment variable name only, such as `ANTHROPIC_API_KEY`
- `keychain_ref`: local keychain item name only
- `external_vault_ref`: external vault pointer, such as cloud secret manager path

These are identifiers only. The MVP must not read the referenced value.

## Forbidden Secret Fields

Repository files must not contain fields named:

- `api_key`
- `secret`
- `token`
- `password`
- `private_key`
- `ssh_key`

The validator flags these as blocker fields if they appear in credential reference files.

## Runtime Center Integration

Runtime Center health checks now consume Credential Vault references when present:

- credential source: `packages/credential-vault/examples/credential-references.example.json`
- fallback source: `packages/runtime-center/examples/credential-references.example.json`
- health check behavior: reference presence only
- no env read
- no keychain read
- no external vault read
- no API call
- no SSH probe

`runtime health --dry-run` reports auth state as:

- `reference_only`
- `not_required`
- `missing`

## Safety

- No real API keys are stored.
- No real SSH keys are stored.
- No real env values are read.
- No keychain item is read.
- No external vault is contacted.
- No Agent is executed.
- No managed project is modified.
- No deploy or production operation is executed.

## Next Milestones

1. Add encrypted local development vault adapter.
2. Add OS keychain adapter behind explicit approval.
3. Add external vault adapter interfaces.
4. Add runtime provider active health probes gated by credential policy.
5. Add Console pages for Credentials and Runtime Health.
