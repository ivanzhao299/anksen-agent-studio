# Self-hosted Identity and Remote MCP

## Outcome

ANKSEN Agent Studio hosts its OAuth/OIDC identity boundary with Keycloak 26.6.4 and PostgreSQL. The public Studio origin remains the only Internet entry point:

```text
ChatGPT / MCP client
  -> https://studio.cnjinhu.com/mcp
  -> OAuth discovery at https://studio.cnjinhu.com/auth/realms/anksen
  -> Keycloak authorization code + PKCE S256
  -> scoped access token (audience https://studio.cnjinhu.com/mcp)
  -> Studio MCP tools
  -> existing Gateway / Planner / Kernel / Night Shift
  -> CONTROLLED_STUB only
```

No second Goal, Planner, Scheduler, Worker, Runtime, audit, or permission model is introduced. Keycloak establishes the external identity; Studio remains authoritative for project access, Goal policy, approval, runtime activation, and audit.

## Public surface

- MCP transport: `https://studio.cnjinhu.com/mcp`
- Protected-resource metadata: `https://studio.cnjinhu.com/.well-known/oauth-protected-resource`
- OIDC metadata: `https://studio.cnjinhu.com/auth/realms/anksen/.well-known/openid-configuration`
- MCP readiness: `https://studio.cnjinhu.com/mcp/ready`

The Console proxy exposes only the `anksen` realm protocol/login paths and Keycloak login assets. It blocks the Keycloak admin API, the master realm, metrics, health endpoints, and every other realm from the public origin.

## Identity and authorization

The bootstrap Studio user receives short-lived access tokens containing:

- `organization_id=studio-org`
- `workspace_id=studio-workspace`
- `project_ids=[anksen-agent-studio]`
- `capabilities=[console.access, autopilot.plan, autopilot.execute.local]`
- `aud=https://studio.cnjinhu.com/mcp`

Studio fails closed if organization, workspace, project, capability, audience, issuer, signature, expiry, or required OAuth scopes are absent. Read and write tools use `studio.goals.read` and `studio.goals.write`. A valid OAuth identity cannot enable CODEX: the Activation Gate, project runtime policy, approval, credential reference, worker authorization, and feature flag remain mandatory.

## CIMD policy

Keycloak's CIMD feature is enabled for MCP client discovery. The client policy accepts only HTTPS Client ID Metadata Documents and related URLs hosted under `chatgpt.com` or `openai.com`. HTTP metadata, arbitrary domains, and public anonymous account registration are denied.

## Server state and secrets

Deployment creates `/opt/anksen/identity/.env` once with mode `0600`. It contains generated database, Keycloak bootstrap-admin, and first-login Studio user passwords. Values are never committed or printed by CI. The non-secret MCP configuration is installed at `/opt/anksen/identity/studio-mcp.json`.

The initial operator retrieves the temporary Studio password on the office server through the existing administrative path, signs in as `studio-admin`, and must replace it during first login. Do not copy this password into GitHub, Studio Goal text, ChatGPT, logs, or documentation.

## Deployment and recovery

`scripts/deploy-identity.sh` is invoked by the guarded deployment. It:

1. creates secrets only when absent;
2. starts Keycloak and PostgreSQL through Docker Compose;
3. waits for local OIDC discovery;
4. applies the restricted CIMD profile and policy idempotently;
5. verifies issuer, PKCE S256, and CIMD metadata;
6. installs the Console MCP configuration;
7. lets the managed Console restart and verify OAuth/MCP readiness.

Persistent identity data lives in the Docker volume `anksen-studio-identity_identity-db-data`. Back up that volume and `/opt/anksen/identity/.env` together using the office server's protected backup process. A database backup without the matching secrets is not a complete recovery set.

## Connecting ChatGPT

After deployment, add `https://studio.cnjinhu.com/mcp` as the remote MCP server in ChatGPT developer mode. ChatGPT discovers the protected resource, redirects to the ANKSEN login, requests the declared read/write scopes, and returns to the MCP connection after authorization. The first test should call `get_activation_readiness`; create a Goal only after the read path succeeds.

## Safety defaults

- Runtime remains `CONTROLLED_STUB`.
- CODEX feature flag remains false.
- Tokens expire after ten minutes.
- Public user registration is disabled.
- Brute-force protection is enabled.
- Keycloak and PostgreSQL listen only on the office host; only the Console's TLS origin is public.
- Admin API, master realm, metrics, and health endpoints are not proxied.
- Deployment fails closed when Docker, identity metadata, PKCE, CIMD, or MCP readiness checks fail.
