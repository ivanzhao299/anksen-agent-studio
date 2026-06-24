# Pilot-3 Credential Backend Policy

- pilot_id: PILOT-3-CREDENTIAL-BACKEND-POLICY
- generated_at: 2026-06-24
- status: PASS_READY_FOR_DRY_RUN_USE
- scope: credential backend policy only

## Summary

Pilot-3 defines the Credential Backend strategy required before real Runtime or Worker execution can read credentials. It keeps Studio in reference-only mode and explicitly forbids storing or reading real API keys, SSH keys, environment values, macOS Keychain items, external vault values, cloud secret manager values, or SSH agent identities.

## Package

`packages/credential-vault/`

New policy files:

- `schemas/backend-policy.schema.json`
- `schemas/backend-selection.schema.json`
- `schemas/credential-scope.schema.json`
- `examples/backend-policy.example.json`
- `examples/backend-selection.example.json`
- `examples/credential-scope.example.json`

## Backend Options

| Backend | Reference Type | Risk | Mode | Secret Read | External Connection |
| --- | --- | --- | --- | --- | --- |
| `local-env-ref` | `env_ref` | MEDIUM | `reference_only` | forbidden | disabled |
| `macos-keychain-ref` | `keychain_ref` | MEDIUM | `reference_only` | forbidden | disabled |
| `ssh-agent-ref` | `ssh_agent_ref` | HIGH | `proposal_only` | forbidden | disabled |
| `external-vault-ref` | `external_vault_ref` | HIGH | `proposal_only` | forbidden | disabled |
| `cloud-secret-manager-ref` | `external_vault_ref` | HIGH | `proposal_only` | forbidden | disabled |
| production credential | any | CRITICAL | `human_approval_required` | forbidden | disabled |

## Environment Separation

- `local`: allowed for reference-only local env and macOS keychain metadata.
- `staging`: allowed for proposal-only external/SSH reference planning.
- `production`: CRITICAL only; no production credential backend is selected or connected in Pilot-3.

## Credential Scope

Credential scopes map runtime ids to reference ids and allowed backend ids. The `codex-cli` scope is local-only and allows:

- `local-env-ref`
- `macos-keychain-ref`

No production credential scope is enabled.

## Rotation Policy

Rotation is policy-only:

- mode: `policy_only`
- minimum review: 90 days
- secret value rotation: `not_performed_by_studio`

Studio records rotation expectations but does not rotate, create, fetch, or write real secrets.

## Audit Policy

Audit events:

- `backend.list`
- `backend.select`
- `scope.check`
- `audit.policy`

Audit logs must not contain secret values. Since Pilot-3 performs no env/keychain/vault/SSH-agent reads, there are no real credential values to redact.

## CLI

```bash
node packages/orchestrator-core/bin/studio.mjs credential backend-list --dry-run
node packages/orchestrator-core/bin/studio.mjs credential backend-select --backend local-env-ref --dry-run
node packages/orchestrator-core/bin/studio.mjs credential scope-check --runtime codex-cli --dry-run
node packages/orchestrator-core/bin/studio.mjs credential audit-policy --dry-run
```

## Safety Boundaries

- API keys: not stored.
- SSH keys: not stored.
- Environment values: not read.
- macOS Keychain values: not read.
- External vaults: not connected.
- Cloud secret managers: not connected.
- SSH agent: not queried.
- Deploy: disabled.
- Production operations: disabled.
- `jinhu-smart-park` modifications: forbidden.

## Validation

```bash
pnpm typecheck
pnpm lint:check
node packages/orchestrator-core/bin/studio.mjs credential backend-list --dry-run
node packages/orchestrator-core/bin/studio.mjs credential backend-select --backend local-env-ref --dry-run
node packages/orchestrator-core/bin/studio.mjs credential scope-check --runtime codex-cli --dry-run
node packages/orchestrator-core/bin/studio.mjs credential audit-policy --dry-run
node packages/orchestrator-core/bin/studio.mjs governance check --dry-run
git diff --check
git status
```

Expected result: all commands pass without reading or saving real credential values.
