# V5 Multi Project Operations MVP

## Scope

V5 Multi Project Operations defines a portfolio-level read-only operations model for managed projects. It can display project health, command readiness, and proposal queues while keeping managed project writes disabled.

## Delivered Artifacts

- `packages/project-connector/schemas/multi-project-operations.schema.json`
- `packages/project-connector/examples/multi-project-operations.example.json`

## Capabilities

- Workspace portfolio summary.
- Managed project read-only operation policy.
- Command readiness descriptors for typecheck, lint, doctor, and other local commands.
- Proposal queue metadata for future managed project writes.
- Approval-required gate for any future write.

## Safety

- `jinhu-smart-park` remains read-only context.
- Managed project writes: disabled.
- Agent execution: disabled.
- Deploy: disabled.
- Production operations: disabled.
- Credential values: not read.

## Validation

- `pnpm typecheck`
- `pnpm lint:check`
- `git diff --check`
