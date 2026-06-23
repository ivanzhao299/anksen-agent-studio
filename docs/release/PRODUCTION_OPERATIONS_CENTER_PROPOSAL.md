# Production Operations Center Proposal

Generated for V4-O.

## Goal

Define a future Production Operations Center for Agent Studio without enabling production execution. The center would eventually coordinate deploy readiness, production operation requests, approval evidence, execution plans, and audit records behind Governance Center release gates.

This proposal is intentionally non-executable. It does not add deploy commands, production operation commands, server connections, credential value access, or managed project writes.

## Current Decision

V4-O remains `proposal_only`.

Planning Center selected this action as HIGH risk because it touches deploy and production operation semantics. Governance Center and Release Gate checks must continue to block execution categories until a separate explicit approval defines the allowed implementation boundary.

## Proposed Future Scope

Future implementation may add local repository contracts for:

- production operation schema
- operation request schema
- approval evidence schema
- dry-run execution plan schema
- audit event model
- readiness gate summaries
- proposal-only CLI planning commands
- documentation for human approval workflows

All future commands should default to dry-run and produce plans, not execute real operations.

## Required Gates

Before any implementation beyond proposal-only documentation, the following gates must pass:

- Governance Center policy review
- Approval policy review
- Release gate review
- explicit human approval for production-operation semantics
- credential-value non-access verification
- managed-project write boundary verification
- no deploy execution verification
- no server access verification

## Forbidden In This Proposal

- real deploy
- production migration
- production seed
- production reset
- production cleanup
- server or SSH access
- reading or storing API keys
- reading or storing SSH keys
- reading real environment secrets
- calling external production services
- writing to `jinhu-smart-park`
- executing Agents

## Candidate CLI Shape

These commands are only candidate names for a future approved implementation:

```bash
node packages/orchestrator-core/bin/studio.mjs production-center plan --dry-run
node packages/orchestrator-core/bin/studio.mjs production-center gates --dry-run
node packages/orchestrator-core/bin/studio.mjs production-center audit --dry-run
```

No candidate command may execute a production operation without a separate approved implementation proposal.

## Data Model Sketch

Potential future records:

- `operation_id`
- `operation_type`
- `target_project`
- `risk`
- `approval_required`
- `approval_evidence_refs`
- `credential_reference_ids`
- `secret_values_read: false`
- `server_access: disabled`
- `execution_mode: dry_run_plan`
- `audit_status`
- `blocked_reasons`

Credential references must remain references only. Secret values must not be read by health checks, planning commands, release gates, or audit summaries.

## Validation For This Proposal

```bash
pnpm typecheck
pnpm lint:check
node packages/orchestrator-core/bin/studio.mjs governance check --dry-run
node packages/orchestrator-core/bin/studio.mjs release-gate check --dry-run
git diff --check
git status
```

## Next Recommendation

Stop at the approval gate. The next V4 action should be an explicit human approval request that either keeps Production Operations Center blocked or authorizes a narrow local-repository-only MVP for schemas, dry-run CLI, and audit documentation.
