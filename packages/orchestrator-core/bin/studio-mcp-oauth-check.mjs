#!/usr/bin/env node
import { checkAuthorizationServerMetadata, StudioOAuthVerifier } from "../lib/studio-mcp-oauth.mjs";

const verifier = new StudioOAuthVerifier({
  resource: process.env.STUDIO_MCP_PUBLIC_URL,
  issuer: process.env.STUDIO_OAUTH_ISSUER,
  jwksUri: process.env.STUDIO_OAUTH_JWKS_URI,
});
const authorizationServer = await checkAuthorizationServerMetadata({ issuer: verifier.issuer, expectedJwksUri: verifier.jwksUri, metadataUri: process.env.STUDIO_OAUTH_METADATA_URI });
const result = {
  status: authorizationServer.status,
  resource: verifier.resource,
  protectedResourceMetadata: verifier.protectedResourceMetadata(),
  authorizationServer,
  codexRuntime: "DISABLED",
};
console.log(JSON.stringify(result, null, 2));
if (result.status !== "READY") process.exitCode = 1;
