# Beta-004: Local MCP Server

## Result

Beta-004 turns the Beta-003 tool contract into a working Model Context Protocol server using the official TypeScript MCP SDK and stateless Streamable HTTP transport.

```text
Codex / ChatGPT desktop / MCP Inspector
  -> Bearer-authenticated Streamable HTTP /mcp
  -> MCP tools/list or tools/call
  -> Beta-003 StudioGateway
  -> AutonomousExecutionCenter
  -> Planner / Kernel / Scheduler / Worker
  -> CONTROLLED_STUB
  -> Morning Report
```

The MCP layer is only a transport adapter. It does not define another Goal, Planner, Task Graph, Scheduler, Worker, Runtime, Audit, or Outbox.

## Tools

- `create_goal` — idempotent write; Codex is configured to request confirmation.
- `get_goal` — read-only.
- `get_task_graph` — read-only.
- `get_night_shift_session` — read-only.
- `get_activation_readiness` — read-only.
- `get_morning_report` — read-only.

Every tool returns the same object in MCP `structuredContent` and as JSON text in `content` for client compatibility. Tool-level failures return `isError: true` with the stable Gateway error envelope.

## Local startup

Generate a local token in your shell or password manager. Do not save it in this repository.

```bash
export STUDIO_MCP_BEARER_TOKEN='replace-with-a-random-value-of-at-least-16-characters'
pnpm studio-mcp:start
```

Defaults:

- URL: `http://127.0.0.1:4330/mcp`
- Health: `http://127.0.0.1:4330/health`
- Runtime: `CONTROLLED_STUB`
- Codex Feature Flag: disabled

The server refuses a non-loopback bind unless `STUDIO_MCP_ALLOW_REMOTE=true`. That override is not a production deployment solution; remote use still requires an external HTTPS boundary and Beta-005 OAuth.

## Codex connection

The committed project-scoped `.codex/config.toml` registers `anksen_studio` as a Streamable HTTP MCP server and obtains its bearer token from `STUDIO_MCP_BEARER_TOKEN`. Start Codex from an environment containing that variable, then restart the Codex client after the server is running.

Equivalent CLI registration for a user-level configuration is:

```bash
codex mcp add anksen_studio \
  --url http://127.0.0.1:4330/mcp \
  --bearer-token-env-var STUDIO_MCP_BEARER_TOKEN
```

The project configuration defaults to `prompt`, keeps an explicit prompt for `create_goal`, and sets the five read-only tools to `auto`. This matches the approval modes accepted by the currently installed Codex client.

## MCP Inspector

Start the MCP service, then run:

```bash
pnpm dlx @modelcontextprotocol/inspector \
  http://127.0.0.1:4330/mcp \
  --cli \
  --transport http \
  --header "Authorization: Bearer $STUDIO_MCP_BEARER_TOKEN" \
  --method tools/list
```

## Automated verification

```bash
pnpm studio-mcp:smoke
```

The smoke uses the official MCP Client and Streamable HTTP client transport. It initializes the server, lists all six tools, calls `create_goal`, then reads the Task Graph, Readiness, and Morning Report from PostgreSQL-backed Night Shift state.

## Security boundary

- Bearer authentication is mandatory on `/mcp`.
- Tokens are accepted only from process environment and are never written to configuration, logs, tool results, Tasks, Outbox, or reports.
- The service binds to loopback by default.
- Requests still pass Beta-003 rate limiting, idempotency, Access/Gateway context, Kernel audit, and Outbox.
- `create_goal` cannot enable CODEX or bypass Activation Gate.
- `GET /health` exposes only transport/runtime flags and no data.
- Streamable HTTP is stateless; there is no orphan MCP session state after a request.

## Remaining work

- Beta-005 now provides the OAuth protected-resource boundary, metadata, audience/scope verification, and Studio project identity mapping; public HTTPS deployment and IdP configuration remain operator-controlled.
- Replace local bearer tokens with short-lived OAuth access tokens for ChatGPT web.
- Move rate-limit and replay state to a shared store before multiple Gateway replicas.
- Add service supervision/monitoring if the local MCP server must remain resident overnight.
- Perform the first user-approved Goal call from a restarted Codex client; this cannot be injected into the already-running client process by repository code.
