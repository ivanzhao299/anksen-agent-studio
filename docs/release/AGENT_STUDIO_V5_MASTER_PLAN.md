# ANKSEN Agent Studio V5 Master Plan

V5 productizes the V4 platform into an enterprise software factory. The plan is machine-readable through `runtime/global/v5-roadmap.json` and governed by `packages/planning-center/schemas/v5-master-plan.schema.json`.

## Safety Policy

- Real Worker execution: disabled.
- Real credential values: not read or written.
- Deploy: disabled.
- Production operations: disabled.
- Managed project writes: disabled unless a separately approved proposal exists.
- HIGH and CRITICAL risk work: proposal-only.
- `jinhu-smart-park` remains read-only context.

## Stage Summary

| Order | Stage | Goal | Risk | Automation | Approval | Execution |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | V5-A Enterprise Runtime | Enterprise runtime control plane, adapter capability scoring, and dry-run invocation evidence. | MEDIUM | autopilot_execute | No | local_repo_execute |
| 2 | V5-B Enterprise Credential Vault | Credential lifecycle policy, provider mapping, audit, and secretless runtime contracts. | HIGH | proposal_only | Yes | proposal_only |
| 3 | V5-C Multi Project Operations | Read-only portfolio operations, project health, command readiness, and proposal-only write planning. | MEDIUM | autopilot_execute | No | local_repo_execute |
| 4 | V5-D Production Operations | Production readiness proposal framework for deploy, backup, rollback, hardening, and monitoring. | CRITICAL | human_approval_required | Yes | proposal_only |
| 5 | V5-E Enterprise Console | Operator console for roadmap, gates, proposals, audit evidence, and dry-run command descriptors. | MEDIUM | autopilot_execute | No | local_repo_execute |
| 6 | V5-F Autonomous Software Factory | Fully governed autonomous factory target state, worker orchestration proposal, audit, and kill-switch model. | CRITICAL | human_approval_required | Yes | proposal_only |

## V5-A Enterprise Runtime

Goal: Turn Runtime Center and Runtime Adapter Marketplace into an enterprise runtime control plane.

Milestones:
- Define enterprise runtime profile schema and capability score model.
- Add adapter policy metadata for network, workspace, credential reference, and concurrency boundaries.
- Expose dry-run runtime selection and invoke-plan evidence for Autopilot.
- Keep real Worker execution disabled until a separate smoke proposal is approved.

Dependencies: V4-I Runtime Center, V4-K Runtime Adapter Marketplace, V4-M Governance and Release Gates, V4-P Autopilot Continuous Mode.

## V5-B Enterprise Credential Vault

Goal: Expand Credential Vault from reference presence into enterprise-grade credential lifecycle policy.

Milestones:
- Define enterprise vault tenancy, rotation, expiration, and audit schemas.
- Model provider-specific credential references without reading secret values.
- Add proposal-only rotation and access review plans.
- Keep credential value reads and writes disabled.

Dependencies: V4-J Credential Vault MVP, V5-A Enterprise Runtime.

## V5-C Multi Project Operations

Goal: Upgrade project connectors into a multi-project operations layer that can plan and compare safe work across repositories.

Milestones:
- Define workspace-level project operation schema and queue metadata.
- Add read-only portfolio health and command readiness views.
- Generate proposal-only managed project write plans.
- Preserve `jinhu-smart-park` as read-only unless an explicit proposal is approved.

Dependencies: V4-A/B/C Project Connector, V4-L Multi-Project Workspace, V5-A Enterprise Runtime.

## V5-D Production Operations

Goal: Move Production Operations Center from dry-run package to governed production operation proposal framework.

Milestones:
- Define production readiness and emergency approval proposal models.
- Keep all real server, SSH, deploy, backup, rollback, and production commands disabled.
- Require CRITICAL approval for any future real production operation.
- Record audit evidence for every production proposal.

Dependencies: V4-O Production Operations Center Dry-Run, V5-B Enterprise Credential Vault, V5-C Multi Project Operations.

## V5-E Enterprise Console

Goal: Turn the read-only Console into an enterprise operator console.

Milestones:
- Add enterprise console information architecture and action registry.
- Display V5 roadmap, risk gates, proposal queues, and audit evidence.
- Keep command descriptors dry-run or proposal-only.
- Prepare UI contracts for future approval workflows without executing production operations.

Dependencies: V4-R Console operable read-only controls, V5-A Enterprise Runtime, V5-C Multi Project Operations.

## V5-F Autonomous Software Factory

Goal: Define the fully autonomous software factory target state under strict approval gates.

Milestones:
- Define autonomous factory governance and kill-switch model.
- Create proposal-only worker orchestration and approval workflows.
- Define audit, replay, rollback, and operator override requirements.
- Keep real autonomous production execution disabled until separately approved.

Dependencies: V5-A Enterprise Runtime, V5-B Enterprise Credential Vault, V5-C Multi Project Operations, V5-D Production Operations, V5-E Enterprise Console.

## Autopilot Integration

Autopilot reads `runtime/global/v5-roadmap.json` through the normal Planning Center request path. When the goal targets V5, Planning Center selects the first planned V5 stage in order and applies the governance rule:

- LOW or MEDIUM: local repository execution may be proposed for safe schemas, examples, docs, and dry-run CLI work.
- HIGH or CRITICAL: proposal-only, no automatic execution.

Initial next action is V5-A Enterprise Runtime.
