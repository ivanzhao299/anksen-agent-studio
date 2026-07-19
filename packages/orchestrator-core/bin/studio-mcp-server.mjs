#!/usr/bin/env node
import { createStudioMcpHttpServer } from "../lib/studio-mcp-server.mjs";
import { checkAuthorizationServerMetadata, StudioOAuthVerifier } from "../lib/studio-mcp-oauth.mjs";

const oauthMode = process.env.STUDIO_MCP_AUTH_MODE === "oauth";
const oauthVerifier = oauthMode ? new StudioOAuthVerifier({
  resource: process.env.STUDIO_MCP_PUBLIC_URL,
  issuer: process.env.STUDIO_OAUTH_ISSUER,
  jwksUri: process.env.STUDIO_OAUTH_JWKS_URI,
}) : null;
const oauthReadiness = oauthVerifier ? await checkAuthorizationServerMetadata({
  issuer: oauthVerifier.issuer,
  expectedJwksUri: oauthVerifier.jwksUri,
  metadataUri: process.env.STUDIO_OAUTH_METADATA_URI,
}) : { status: "READY", failures: [] };
if (oauthReadiness.status !== "READY") throw new Error(`OAuth authorization server is not ready: ${oauthReadiness.failures.join(", ")}`);

const service = createStudioMcpHttpServer({
  token: process.env.STUDIO_MCP_BEARER_TOKEN,
  oauthVerifier,
  host: process.env.STUDIO_MCP_HOST ?? "127.0.0.1",
  port: Number(process.env.STUDIO_MCP_PORT ?? 4330),
  rateLimit: Number(process.env.STUDIO_MCP_RATE_LIMIT ?? 60),
  readiness: { status: oauthReadiness.status, authentication: oauthMode ? "oauth2" : "local_bearer", authorizationServer: oauthMode ? oauthVerifier.issuer : null },
});
const address = await service.start();
console.log(`ANKSEN Studio MCP listening on http://${address.address}:${address.port}/mcp`);
console.log(`Authentication: ${oauthMode ? "OAuth 2.1 resource server" : "local bearer token"}.`);
console.log("Runtime: CONTROLLED_STUB; CODEX activation is unavailable through this server.");
const shutdown = async () => { await service.close(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
