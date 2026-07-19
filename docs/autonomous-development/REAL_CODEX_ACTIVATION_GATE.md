# Real Codex Activation Gate

The gate is a control-plane authorization service only. It never invokes Codex. CONTROLLED_STUB is allowed after authenticated project/RBAC and path/command policy checks; CODEX requires every readiness check plus atomic Approval consumption. `AUTONOMOUS_RUNTIME_CODEX_ENABLED` remains false.

Approval states are PENDING, APPROVED, REJECTED, EXPIRED, REVOKED and CONSUMED. An Approval is bound to organization, workspace, project, Goal, Task, runtime, Worker, policy version and expiry. `SELECT ... FOR UPDATE` increments `used_count`; the default single use becomes CONSUMED and replay is rejected.

Project policy fixes the canonical project root, allowed/blocked paths and commands, runtime/attempt limits and commit permission. Push, merge and deploy are database-constrained false. Access Center-compatible actor context requires authentication, workspace membership, project allowlist and explicit capability. Project Connector supplies the root and scope.

Credential storage accepts only a syntactically restricted `CredentialReference` identifier and reference type. Known token formats, secret-like keys and raw values are rejected before SQL. No resolution value is persisted into Task, logs, events or reports.

Internal API:

- `createApproval(actor, input)`
- `transitionApproval(actor, id, APPROVED|REJECTED|REVOKED)`
- `getPolicy(scope, version?)`
- `readiness(actor, input)`
- `authorizeRuntime(actor, input)`

Readiness reports PostgreSQL, migration, Worker, policy, RBAC, Approval, Credential Reference, Codex CLI health and Feature Flag separately. It returns READY only when every check passes.

`SessionProjectionConsumer` replays transactional Outbox events into an idempotent Session Projection containing Session/Goal/Worker state, blocking reasons and Morning Report. `(consumer_name,event_id)` prevents replay duplication.

The crash smoke starts a child Worker process, leaves active leases, exits, waits for expiry and starts a fresh recovery process. Safe work is requeued; commit evidence is blocked. Recovery reads only PostgreSQL state, making it equivalent to an OS/process restart rather than in-memory continuation.
