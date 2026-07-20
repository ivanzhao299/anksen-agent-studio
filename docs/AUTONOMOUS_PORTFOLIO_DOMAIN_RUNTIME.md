# Autonomous Portfolio & Domain Skill Runtime

## Product outcome

Studio now has a group-level long-task control plane above its eight independent business applications. A Campaign owns an outcome, schedule and budget. Each selected business domain becomes an Initiative whose Workflow is compiled from the existing Domain Center. Every Workflow stage resolves a business Skill, platform skill type, Agent, Runtime and online Worker before dispatch.

This implementation does not create another Planner, Scheduler, Worker or runtime model. Approved Initiatives are submitted by `PersistentDomainWorkflowService` to the existing PostgreSQL Autonomous Kernel and completed by the existing Resident Worker using `CONTROLLED_STUB`. Real Codex remains a separate governed approval path.

## Detailed implementation graph

| ID | Deliverable | Dependency | Result |
| --- | --- | --- | --- |
| AP-001 | Audit Domain Center, Skill Router, Agent Registry and Worker Registry | — | Reuse boundary confirmed |
| AP-010 | Durable Campaign and Initiative model | AP-001 | JSON checkpoint store with restart recovery |
| AP-020 | Skill Pack and Agent assignment compiler | AP-010 | Uses existing domain Workflow and registries |
| AP-030 | Task, token-estimate and runtime-minute budget gates | AP-020 | Dispatch fails closed before Kernel submission |
| AP-040 | Once and recurring schedule with bounded cycles | AP-030 | Resident 30-second scheduler and manual tick |
| AP-050 | Kernel dispatch bridge | AP-040 | Existing Domain Workflow → Kernel → Scheduler → Worker |
| AP-060 | Portfolio API and product console | AP-050 | Draft, approve, run, pause and evidence views |
| AP-070 | Idempotency, contention, recovery and UI tests | AP-060 | Focused verification suite |

Shortest path: AP-001 → AP-010 → AP-020 → AP-030 → AP-040 → AP-050 → AP-060 → AP-070.

## Runtime model

`Campaign → Business Application → Domain Initiative → Workflow Stage → Business Skill → Skill Type → Agent → Online Worker → Autonomous Kernel → Morning Report`

- Application is a product and ownership boundary, not an Agent.
- Domain owns professional Workflow and Skill Pack composition.
- Skill describes a capability contract and validation expectations.
- Agent owns a stage according to the existing Agent Registry.
- Worker is live execution capacity selected from the existing Worker Registry.
- Kernel remains the sole source of Task, Dependency, Attempt, Lease and status truth.

## Persistence and recovery

Campaign checkpoints live under `runtime/autonomous-portfolio/` and are intentionally excluded from source commits. Stable Campaign/Initiative session keys make re-submission idempotent. A per-Campaign file lock prevents concurrent scheduler ticks. Stale locks and stale `DISPATCHING` checkpoints are recovered after ten minutes; budget reservations are rolled back before the same idempotent session is resumed.

## Budgets

The scheduler enforces maximum reserved tasks, estimated tokens and estimated runtime minutes before dispatch. Token estimates are planning reservations, not billed usage. `actualTokenUsage` and `actualCostUsd` stay `null` unless a Runtime supplies authoritative values. Studio does not fabricate missing cost data.

## API

- `GET /api/portfolio/campaigns` — campaigns plus the application/domain catalog.
- `POST /api/portfolio/campaigns` — create a DRAFT Campaign.
- `POST /api/portfolio/campaigns/:id/activate` — project-scoped approval and activation.
- `POST /api/portfolio/campaigns/:id/tick` — dispatch at most one due Initiative.
- `POST /api/portfolio/campaigns/:id/pause` — stop future dispatches without destroying state.

## Human checkpoints and current limits

An authorized user must create and approve every Campaign. Missing Agent or Worker capacity blocks the affected Initiative. Business integrations that are not connected remain simulated by `CONTROLLED_STUB`; a successful report proves orchestration, not completion of an external business transaction. CODEX tasks still require the separate governed Codex proposal, path policy and one-time approval. Commit, push, merge and deploy remain outside this Campaign runtime.

## Next implementation target

The next bounded phase is Business Outcome Connectors: define verified KPI sources and result adapters for Strategy, HR, Finance, Growth, Manufacturing and Smart Park, then replace `AWAITING_SOURCE` cards with source-backed outcomes. External writes must remain approval-gated and idempotent.
