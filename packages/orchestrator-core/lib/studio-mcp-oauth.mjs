import { createRemoteJWKSet, jwtVerify } from "jose";
import { GatewayError } from "./studio-gateway.mjs";

export const STUDIO_MCP_SCOPES = Object.freeze({ read: "studio.goals.read", write: "studio.goals.write" });

const bearerToken = (headers = {}) => {
  const authorization = String(headers.authorization ?? "");
  if (!authorization.startsWith("Bearer ")) throw new GatewayError("AUTH_REQUIRED", "OAuth bearer token required.", 401);
  return authorization.slice(7).trim();
};

export function validateRemoteMcpConfig({ resource, issuer, jwksUri, jwksFetchUri = jwksUri, allowInsecureLocalhost = false }) {
  for (const [name, value] of Object.entries({ resource, issuer, jwksUri })) {
    if (!value) throw new Error(`${name} is required for remote MCP OAuth mode.`);
    const url = new URL(value);
    const local = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(allowInsecureLocalhost && local)) throw new Error(`${name} must use HTTPS outside an explicit localhost test fixture.`);
  }
  const fetchUrl = new URL(jwksFetchUri);
  const fetchLocal = ["127.0.0.1", "localhost", "::1"].includes(fetchUrl.hostname);
  if (fetchUrl.protocol !== "https:" && !(fetchUrl.protocol === "http:" && fetchLocal)) throw new Error("jwksFetchUri must use HTTPS or explicit loopback HTTP.");
  return { resource: resource.replace(/\/$/, ""), issuer: issuer.replace(/\/$/, ""), jwksUri, jwksFetchUri };
}

export class StudioOAuthVerifier {
  constructor({ resource, issuer, jwksUri, jwksFetchUri = jwksUri, allowInsecureLocalhost = false, jwks, clockTolerance = 5 } = {}) {
    const config = validateRemoteMcpConfig({ resource, issuer, jwksUri, jwksFetchUri, allowInsecureLocalhost });
    this.resource = config.resource;
    this.issuer = config.issuer;
    this.jwksUri = config.jwksUri;
    this.jwksFetchUri = config.jwksFetchUri;
    this.jwks = jwks ?? createRemoteJWKSet(new URL(this.jwksFetchUri));
    this.clockTolerance = clockTolerance;
  }

  challenge(scopes = [STUDIO_MCP_SCOPES.read]) {
    const metadataUrl = new URL("/.well-known/oauth-protected-resource", this.resource).href;
    return `Bearer resource_metadata="${metadataUrl}", scope="${scopes.join(" ")}"`;
  }

  protectedResourceMetadata() {
    return {
      resource: this.resource,
      authorization_servers: [this.issuer],
      scopes_supported: [STUDIO_MCP_SCOPES.read, STUDIO_MCP_SCOPES.write],
      bearer_methods_supported: ["header"],
    };
  }

  async authenticate(headers = {}) {
    const token = bearerToken(headers);
    let verified;
    try {
      verified = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.resource,
        clockTolerance: this.clockTolerance,
      });
    } catch (error) {
      throw new GatewayError("OAUTH_TOKEN_INVALID", "OAuth access token is invalid or expired.", 401, { reason: error.code ?? "JWT_REJECTED" });
    }
    const payload = verified.payload;
    const scopes = new Set(String(payload.scope ?? "").split(/\s+/).filter(Boolean));
    if (!payload.sub) throw new GatewayError("OAUTH_SUBJECT_REQUIRED", "OAuth token subject is required.", 401);
    if (!payload.organization_id || !payload.workspace_id) throw new GatewayError("OAUTH_SCOPE_CONTEXT_REQUIRED", "OAuth organization and workspace claims are required.", 403);
    if (!Array.isArray(payload.project_ids) || payload.project_ids.length === 0) throw new GatewayError("OAUTH_PROJECTS_REQUIRED", "OAuth project_ids must contain at least one project.", 403);
    if (!Array.isArray(payload.capabilities) || payload.capabilities.length === 0) throw new GatewayError("OAUTH_CAPABILITIES_REQUIRED", "OAuth capabilities must contain at least one capability.", 403);
    return {
      authenticated: true,
      principalId: String(payload.sub),
      authType: "oauth2",
      user: { user_id: String(payload.sub) },
      organizationId: payload.organization_id ? String(payload.organization_id) : undefined,
      workspaceId: payload.workspace_id ? String(payload.workspace_id) : undefined,
      projectIds: Array.isArray(payload.project_ids) ? payload.project_ids.map(String) : [],
      capabilities: Array.isArray(payload.capabilities) ? payload.capabilities.map(String) : [],
      scopes,
      tokenId: payload.jti ? String(payload.jti) : undefined,
    };
  }

  requireScopes(context, required) {
    const missing = required.filter((scope) => !context?.scopes?.has(scope));
    if (missing.length) throw new GatewayError("OAUTH_SCOPE_INSUFFICIENT", `Missing OAuth scope: ${missing.join(", ")}.`, 403, { requiredScopes: required });
  }
}

export async function checkAuthorizationServerMetadata({ issuer, expectedJwksUri, metadataUri = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(metadataUri, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Authorization server metadata request failed with HTTP ${response.status}.`);
  const metadata = await response.json();
  const failures = [];
  if (metadata.issuer !== issuer.replace(/\/$/, "")) failures.push("issuer mismatch");
  if (!metadata.authorization_endpoint) failures.push("authorization_endpoint missing");
  if (!metadata.token_endpoint) failures.push("token_endpoint missing");
  if (!metadata.jwks_uri) failures.push("jwks_uri missing");
  if (expectedJwksUri && metadata.jwks_uri !== expectedJwksUri) failures.push("jwks_uri mismatch");
  if (!metadata.code_challenge_methods_supported?.includes("S256")) failures.push("PKCE S256 unsupported");
  const localIssuer = ["127.0.0.1", "localhost", "::1"].includes(new URL(issuer).hostname);
  for (const field of ["authorization_endpoint", "token_endpoint", "jwks_uri"]) {
    if (metadata[field] && new URL(metadata[field]).protocol !== "https:" && !localIssuer) failures.push(`${field} must use HTTPS`);
  }
  return { status: failures.length ? "NOT_READY" : "READY", failures, metadata: { issuer: metadata.issuer, authorization_endpoint: metadata.authorization_endpoint, token_endpoint: metadata.token_endpoint, jwks_uri: metadata.jwks_uri, registration_endpoint: metadata.registration_endpoint ?? null, code_challenge_methods_supported: metadata.code_challenge_methods_supported ?? [] } };
}
