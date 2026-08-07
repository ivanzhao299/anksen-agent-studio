# Studio Isolation, Avernet Compatibility, and Long-Term Memory

## Decision

This delivery strengthens the existing ANKSEN Studio control plane. It does not create a second Planner, Scheduler, Worker, Runtime, queue, Goal, Task, or state machine.

1. Governed development jobs can opt into Git worktree isolation. The source worktree is inspected for agent-owned and human/unknown changes; the remote default branch is fetched and pinned; execution happens on a new `codex/<task>` branch in an independent worktree. Source or remote drift fails closed.
2. Avernet connects through a Provider-compatible boundary. `chat.send` maps to the existing Studio Gateway and requires an explicit authorized project. Inbox and Outbox records are durable and idempotent. Avernet cannot grant repository, Runtime, release, credential, or production permission.
3. MemPalace is a derived retrieval index, not authoritative memory. The official MIT repository is pinned at `1d113e46a2c7db81a00f9e799e0db92bdd37987f`. Automatic transcript mining and writes are disabled by default.

## Stage 1 gates

- Source changes are classified as `AGENT` only when claimed by a known task; otherwise they are `HUMAN_OR_UNKNOWN`.
- Task branches use `codex/` and start at fetched `origin/<defaultBranch>`.
- Worktree directories must remain beneath the configured worktree root.
- Source digest and remote commit are checked again before execution.
- Agent changes are recorded against the task worktree only.
- Legacy jobs remain clean-worktree gated unless `workspaceIsolation` is explicitly enabled.
- Managed issue development enables the isolation path.

## Stage 2 protocol boundary

Routes are disabled when `AVERNET_PROVIDER_TOKEN` is absent:

- `GET /api/avernet/provider/manifest`
- `POST /api/avernet/provider/messages`

Deployment configuration uses secret injection and must never be committed: `AVERNET_PROVIDER_TOKEN`, `AVERNET_PROVIDER_ID`, `AVERNET_ALLOWED_PROJECT_IDS`, `AVERNET_ORGANIZATION_ID`, and `AVERNET_WORKSPACE_ID`.

Supported methods are `chat.send`, `chat.inject`, `chat.abort`, and `chat.history`. Request `id` is the business idempotency key. Reuse with different content conflicts. `chat.inject` never starts inference. Studio Access Center and project policies remain authoritative.

The file-backed bridge is suitable for one Console process. Multi-replica production activation requires PostgreSQL Inbox/Outbox, callback leases, retry backoff, reconciliation, and terminal-delivery proof. Until then the Provider remains disabled in production.

## Stage 3 MemPalace boundary

- Repository: `https://github.com/MemPalace/mempalace`
- Commit: `1d113e46a2c7db81a00f9e799e0db92bdd37987f`
- Version: `3.7.0`
- License: MIT
- Upstream maturity: Beta

Useful capabilities are verbatim local storage, semantic retrieval, backend contracts, MCP, knowledge graph, delete operations, and local HTTP protections. Risks include durable retention of secrets or personal data, embedding-model drift, Chroma's lack of namespace isolation, and optional remote vector backends.

Studio supplies a disabled-by-default adapter with organization/workspace/project path isolation, no shell invocation, bounded queries/output, redaction before writes, separate write approval, and non-authoritative result labels.

Production activation additionally requires retention, delete/export, privacy review, encrypted storage, backup/restore, tenant-isolation tests, and a credential reference. MemPalace failure must not prevent access to authoritative Runtime Memory or audit history.

## Acceptance

- Worktree tests cover dirty human changes, remote-based branch creation, source drift, and ownership claims.
- Avernet tests cover authentication, protocol negotiation, explicit projects, idempotency, inject, history, and cancellation routing.
- MemPalace tests cover disabled defaults, non-authoritative status, traversal, write gating, redaction, and shell-free invocation.
- Workspace typecheck, tests, lint, Console smoke/build, patch check, secret scan, GitHub Actions, deployment, and public health checks must pass.
