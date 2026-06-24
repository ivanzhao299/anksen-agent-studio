# Project Chain Report

- validation_id: V5-PROJECT-CHAIN
- generated_at: 2026-06-24
- status: PARTIAL
- score: 58/100

## Chain

Project Connector -> Project Runtime Memory -> Project Adapter -> Task Proposal -> Approval -> Remote Execute

## Evidence

Commands:

- `node packages/orchestrator-core/bin/studio.mjs project intake --config examples/jinhu-smart-park/project.config.example.json --dry-run`
- `node packages/orchestrator-core/bin/studio.mjs project stack --config examples/jinhu-smart-park/project.config.example.json --dry-run`
- `node packages/orchestrator-core/bin/studio.mjs project commands --config examples/jinhu-smart-park/project.config.example.json --dry-run`

Observed result:

- `jinhu-smart-park` intake resolves the local path and Git metadata.
- Stack detector identifies Next.js, NestJS, TypeScript, Prisma/PostgreSQL, Docker, CI/CD, and project state.
- Command detector finds install, typecheck, lint, test, build, dev, and doctor commands.
- Command execution is explicitly disabled.
- Project writes, deploy, production operations, and credential values are disabled.

## Product Readiness

PARTIAL. Project discovery and command readiness are usable as a read-only product chain. Runtime memory exists for `jinhu-smart-park`, but task proposal, approval, and remote execute remain policy-gated and are not yet a complete in-product workflow.

## Blockers

- Remote execute is not validated in this repository run.
- Approved project write flow is not connected to a product UI.
- SSH/server observability is outside this safe validation and must remain gated.

## Remaining Gaps

- Add a read-only project chain summary command.
- Add proposal queue status and approval status to the Console.
- Add approved remote execute smoke only after a separate gate restores SSH observability and explicitly allows it.

## Safety

- `jinhu-smart-park` modified: no.
- Agent execution: disabled.
- Deploy: disabled.
- Production operations: disabled.
- Credential values: not read.
