# AD-004.5 Compatibility and Deduplication

There is one authoritative future implementation per concept:

| Concept | Main implementation | Compatibility path |
|---|---|---|
| Goal/task/scheduler | autonomous kernel | model-gateway Proposal is approval input only |
| transactional queue | `ad_task` | controlled queue preflight gates admission/claim |
| live worker registry/claim/lease | autonomous kernel | worker-pool profile adapter supplies capabilities |
| runtime state/execution | runtime-adapters | kernel stores attempts/leases, not runtime internals |
| audit/outbox | autonomous kernel transaction | console consumes projections later |

No old API compatibility layer is needed because no Studio external API changed. Activation must use `disabled -> shadow -> authoritative`; authoritative mode is prohibited until the authenticated adapter, real PostgreSQL tests and operator rollback runbook are approved. The present branch is effectively disabled and exposes library code only.
