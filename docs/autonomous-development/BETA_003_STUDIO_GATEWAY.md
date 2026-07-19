# Beta-003: ChatGPT ⇄ Studio Gateway

## Result

Beta-003 adds an authenticated control-plane facade over the existing Autonomous Execution Center. It does not add another Goal, Planner, Scheduler, Worker, Runtime, Audit, or Outbox implementation.

```text
ChatGPT / MCP / client
  -> Studio Gateway auth + rate limit + idempotency
  -> AutonomousExecutionCenter
  -> PersistentNightShiftService
  -> PlannerService.planAndSubmit contract
  -> Autonomous Kernel / Scheduler / Worker
  -> CONTROLLED_STUB
  -> Session Projection / Morning Report
```

The Gateway defaults to `CONTROLLED_STUB`. It cannot turn on CODEX. A later real execution still has to pass Activation Gate, Access Center RBAC, Project Runtime Policy, one-time Approval, Credential Reference, Worker authorization, and the Codex feature flag.

## Contracts

- OpenAPI 3.1: `packages/orchestrator-core/schemas/studio-gateway.openapi.yaml`
- Goal JSON Schema: `packages/orchestrator-core/schemas/studio-gateway-goal.schema.json`
- MCP-compatible tools: `packages/orchestrator-core/schemas/studio-gateway-mcp-tools.json`

MCP tools are `create_goal`, `get_goal`, `get_task_graph`, `get_night_shift_session`, `get_activation_readiness`, and `get_morning_report`. Tool inputs and outputs are explicitly schematized. `create_goal` is a non-destructive, idempotent write and the other tools are read-only.

## Authentication boundary

Browser clients continue to use an Access Center session. Non-browser clients can use either:

1. A local service token from `STUDIO_GATEWAY_SERVICE_TOKENS=client-id:token`.
2. HMAC-SHA256 using `STUDIO_GATEWAY_SIGNING_SECRETS=client-id:secret` plus `X-Anksen-Key-Id`, `X-Anksen-Timestamp`, `X-Anksen-Nonce`, and `X-Anksen-Signature`.

The signed payload is:

```text
timestamp + "\n" + nonce + "\n" + HTTP_METHOD + "\n" + pathname + "\n" + sha256(canonical_json_body)
```

Timestamps have a five-minute window and nonces cannot be replayed within that window. Rate limiting is per authenticated principal. Service tokens and signing secrets come only from process environment and are not returned in logs or responses.

For a remote ChatGPT App, this is not the final public authentication layer. The production MCP server must implement OAuth 2.1 resource metadata, authorization-code flow with PKCE, audience/scope verification, and HTTPS. The current service-token/HMAC boundary is intended for local clients, trusted internal adapters, and automated tests.

## REST endpoints

- `POST /api/v1/goals`
- `GET /api/v1/goals/{goalId}`
- `GET /api/v1/goals/{goalId}/task-graph`
- `GET /api/v1/night-shift/sessions/{sessionKey}`
- `GET /api/v1/night-shift/sessions/{sessionKey}/morning-report`
- `GET /api/v1/readiness`

Every write requires an idempotency key. Retries with the same scope, key, and body return the same persisted Goal/Session; a changed body conflicts at the Kernel fingerprint boundary. Constraints and acceptance criteria are retained in Goal and Task metadata.

## Local call

Start the Console with a temporary local token:

```bash
STUDIO_GATEWAY_SERVICE_TOKENS='chatgpt-local:replace-with-random-local-token' pnpm console:dev
```

Create a Goal:

```bash
curl --fail-with-body http://127.0.0.1:4317/api/v1/goals \
  -H 'Authorization: Bearer replace-with-random-local-token' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: beta-003-example-1' \
  --data '{"title":"完善 Runtime 文档","projectId":"anksen-agent-studio","constraints":["CONTROLLED_STUB only"],"acceptanceCriteria":["Morning Report exists"]}'
```

Run the isolated end-to-end smoke:

```bash
pnpm studio-gateway:smoke
```

## Audit and Outbox

The Gateway does not introduce a parallel audit store. Goal creation, planning, scheduling, claims, attempts, leases, state transitions, and reports continue through existing Kernel transactions and Outbox records. Authentication failures and rate-limit failures use a stable request error envelope; persistent security-event projection remains future work.

## Remaining production work

- Implement and deploy a real HTTPS MCP transport using the published tool contract.
- Connect remote ChatGPT Apps through OAuth 2.1/PKCE and Access Center token mapping.
- Replace in-process nonce and rate-limit state with a shared store for multiple Gateway replicas.
- Add durable API access/security audit records without duplicating Kernel state-transition audit.
- Add reverse-proxy limits, TLS, monitoring, rotation, and incident controls.
- Keep CODEX disabled until the existing Activation Gate is explicitly satisfied.
