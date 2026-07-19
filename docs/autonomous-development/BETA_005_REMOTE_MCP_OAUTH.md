# Beta-005: Remote MCP OAuth Boundary

## Result

Beta-005 adds the production-facing authentication boundary required to connect ChatGPT or another remote MCP client to the existing Studio Gateway.

```text
ChatGPT / remote MCP client
  -> HTTPS /mcp
  -> OAuth 2.1 access token (authorization code + PKCE at the external IdP)
  -> JWT signature / issuer / audience / lifetime / scope verification
  -> Project allowlist and Gateway rate limit
  -> existing StudioGateway
  -> existing AEC / Planner / Kernel / Scheduler / Worker
  -> CONTROLLED_STUB
```

This implementation is an OAuth protected-resource server. It intentionally does not build a new authorization server. A production deployment must use an established OIDC/OAuth provider that supports authorization code flow, PKCE S256, and either Client ID Metadata Documents or Dynamic Client Registration.

## Discovery

The service publishes both protected-resource metadata paths used by MCP clients:

- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-protected-resource/mcp`

Unauthenticated `/mcp` requests return a `WWW-Authenticate` challenge containing the canonical metadata URL. Tool authorization failures also return `_meta["mcp/www_authenticate"]`.

The protected resource is the canonical public origin configured in `STUDIO_MCP_PUBLIC_URL`. It is also the required JWT audience. HTTPS is mandatory outside an explicit localhost test fixture.

## Scopes and project boundary

- `studio.goals.read`: Goal, Task Graph, Night Shift Session, Readiness, and Morning Report tools.
- `studio.goals.write`: `create_goal`.

Every tool advertises its OAuth security scheme. The access token must include a `sub`, valid issuer and audience, and the required space-delimited `scope`. Optional `organization_id`, `workspace_id`, and `project_ids` claims map into the existing Gateway identity context. A non-empty `project_ids` claim is enforced for both writes and reads.

## Configuration

Do not commit values for these variables:

```text
STUDIO_MCP_AUTH_MODE=oauth
STUDIO_MCP_PUBLIC_URL=https://studio.example.com
STUDIO_OAUTH_ISSUER=https://identity.example.com
STUDIO_OAUTH_JWKS_URI=https://identity.example.com/.well-known/jwks.json
STUDIO_OAUTH_METADATA_URI=https://identity.example.com/.well-known/openid-configuration
STUDIO_MCP_HOST=127.0.0.1
STUDIO_MCP_PORT=4330
```

Run the metadata and PKCE readiness check before starting the service:

```bash
pnpm studio-mcp:oauth:check
pnpm studio-mcp:start
```

OAuth mode also performs this check during startup and fails closed when issuer metadata, JWKS identity, HTTPS endpoints, or PKCE S256 are invalid. Operational probes are:

- `GET /health`: process liveness only.
- `GET /ready`: OAuth/startup readiness plus the immutable `CONTROLLED_STUB` and disabled-Codex safety state; returns HTTP 503 when not ready.

The application should remain bound to loopback behind a TLS reverse proxy or private ingress. Binding directly to a public interface still requires the explicit remote-binding guard, and does not replace TLS.

## ChatGPT connection

After deployment, connect the HTTPS `/mcp` URL from ChatGPT developer mode. The client discovers protected-resource metadata, completes the external provider's OAuth flow, and sends a short-lived access token whose audience is the Studio public resource URL.

ChatGPT should never receive a service token, static API key, credential value, or production database secret. Real CODEX remains unavailable through these tools; the Activation Gate, Project Runtime Policy, Approval, Credential Reference, worker authorization, and feature flag remain separate mandatory controls.

## Verification

The automated OAuth fixture generates an ephemeral RSA signing key, publishes a local JWKS and OIDC discovery document, and verifies:

- protected-resource metadata and authentication challenge;
- JWT signature, issuer, audience, expiry behavior;
- read/write scope separation and tool security metadata;
- `_meta["mcp/www_authenticate"]` on insufficient scope;
- organization/workspace/project identity mapping;
- cross-project write denial;
- HTTPS enforcement outside localhost;
- existing local bearer-token mode remains compatible.

The full PostgreSQL-backed smoke runs the same OAuth boundary through the official MCP client and the existing AEC:

```bash
pnpm studio-mcp:oauth:smoke
```

It creates a real persisted Goal, Task Graph, Night Shift Session, and Morning Report with `CONTROLLED_STUB`, then proves an unauthorized Project cannot be used by the same token.

## Deployment checklist

Code readiness is not public-service readiness. Before a ChatGPT connection can be completed, the operator must provide:

1. a public HTTPS hostname and certificate;
2. an established OAuth/OIDC provider and registered scopes;
3. authorization server metadata with PKCE S256 and a reachable JWKS;
4. token claims or an identity mapping that supplies Studio project access;
5. a deployed Studio MCP service and monitored TLS ingress;
6. rate limiting in shared storage when more than one replica is used;
7. user enablement of ChatGPT developer mode and creation of the app connection.

No production deployment, IdP mutation, DNS change, or public connection is performed by Beta-005.
