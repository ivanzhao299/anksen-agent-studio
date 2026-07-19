import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { checkAuthorizationServerMetadata, StudioOAuthVerifier } from "../lib/studio-mcp-oauth.mjs";
import { createStudioMcpHttpServer } from "../lib/studio-mcp-server.mjs";

const executionCenter = {
  async createGoal(input) { return { sessionKey: "oauth-session", report: { sessionStatus: "SUCCEEDED" }, received: input }; },
  async getGoal(id) { return { id, project_id: "project-1", status: "SUCCEEDED" }; },
  async getTaskGraph(id) { return { goal: { id, project_id: "project-1" }, tasks: [], dependencies: [] }; },
  async getSession(sessionKey) { return { session_key: sessionKey, goal_id: "11111111-1111-4111-8111-111111111111", status: "SUCCEEDED" }; },
  async getReadiness() { return { status: "READY_FOR_CONTROLLED_STUB", codexFeatureFlag: false }; },
  async getMorningReport(sessionKey) { return { sessionKey, status: "SUCCEEDED" }; },
};

async function fixture() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  Object.assign(publicJwk, { kid: "fixture-key", alg: "RS256", use: "sig" });
  const issuerServer = createServer((request, response) => {
    if (request.url === "/.well-known/openid-configuration") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ issuer, jwks_uri: `${issuer}/jwks`, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, code_challenge_methods_supported: ["S256"] }));
      return;
    }
    if (request.url === "/jwks") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => issuerServer.listen(0, "127.0.0.1", resolve));
  const issuerAddress = issuerServer.address();
  const issuer = `http://127.0.0.1:${issuerAddress.port}`;
  const resource = "http://127.0.0.1:45555";
  const verifier = new StudioOAuthVerifier({ resource, issuer, jwksUri: `${issuer}/jwks`, allowInsecureLocalhost: true });
  const sign = (scope, { audience = resource, expirationTime = "5m", ...claims } = {}) => new SignJWT({ scope, organization_id: "org-1", workspace_id: "workspace-1", project_ids: ["project-1"], ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "fixture-key" }).setIssuer(issuer).setAudience(audience).setSubject("oauth-user").setIssuedAt().setExpirationTime(expirationTime).sign(privateKey);
  return { issuerServer, verifier, sign, resource };
}

test("remote MCP publishes protected-resource metadata and enforces OAuth scopes", async () => {
  const oauth = await fixture();
  const service = createStudioMcpHttpServer({ oauthVerifier: oauth.verifier, port: 0, executionCenter });
  const address = await service.start();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const metadataResponse = await fetch(`${base}/.well-known/oauth-protected-resource`);
    assert.equal(metadataResponse.status, 200);
    const metadata = await metadataResponse.json();
    assert.equal(metadata.resource, oauth.resource);
    assert.equal(metadata.authorization_servers[0], oauth.verifier.issuer);
    const authorizationMetadata = await checkAuthorizationServerMetadata({ issuer: oauth.verifier.issuer });
    assert.equal(authorizationMetadata.status, "READY");

    const unauthorized = await fetch(`${base}/mcp`, { method: "POST" });
    assert.equal(unauthorized.status, 401);
    assert.match(unauthorized.headers.get("www-authenticate"), /resource_metadata=/);

    const readToken = await oauth.sign("studio.goals.read");
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${readToken}` } } });
    const client = new Client({ name: "oauth-scope-test", version: "0.1.0" });
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.find((tool) => tool.name === "create_goal")._meta.securitySchemes[0].scopes, ["studio.goals.write"]);
    const readiness = await client.callTool({ name: "get_activation_readiness", arguments: {} });
    assert.equal(readiness.structuredContent.data.codexFeatureFlag, false);
    const denied = await client.callTool({ name: "create_goal", arguments: { title: "denied", projectId: "project-1", idempotencyKey: "oauth-read-only" } });
    assert.equal(denied.isError, true);
    assert.match(denied.content[0].text, /OAUTH_SCOPE_INSUFFICIENT/);
    assert.match(denied._meta["mcp/www_authenticate"], /studio.goals.write/);
    await transport.close();

    const writeToken = await oauth.sign("studio.goals.read studio.goals.write");
    const writeTransport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${writeToken}` } } });
    const writer = new Client({ name: "oauth-write-test", version: "0.1.0" });
    await writer.connect(writeTransport);
    const created = await writer.callTool({ name: "create_goal", arguments: { title: "accepted", projectId: "project-1", idempotencyKey: "oauth-write" } });
    assert.equal(created.structuredContent.meta.runtime, "CONTROLLED_STUB");
    const crossProject = await writer.callTool({ name: "create_goal", arguments: { title: "denied project", projectId: "project-2", idempotencyKey: "oauth-cross-project" } });
    assert.equal(crossProject.isError, true);
    assert.match(crossProject.content[0].text, /PROJECT_ACCESS_DENIED/);
    await writeTransport.close();
  } finally {
    await service.close();
    await new Promise((resolve) => oauth.issuerServer.close(resolve));
  }
});

test("remote MCP rejects wrong audience and insecure non-local resource configuration", async () => {
  const oauth = await fixture();
  const service = createStudioMcpHttpServer({ oauthVerifier: oauth.verifier, port: 0, executionCenter });
  const address = await service.start();
  try {
    const wrongAudience = await oauth.sign("studio.goals.read", { audience: "https://wrong.example.com" });
    const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, { method: "POST", headers: { authorization: `Bearer ${wrongAudience}` } });
    assert.equal(response.status, 401);
    const expired = await oauth.sign("studio.goals.read", { expirationTime: 0 });
    const expiredResponse = await fetch(`http://127.0.0.1:${address.port}/mcp`, { method: "POST", headers: { authorization: `Bearer ${expired}` } });
    assert.equal(expiredResponse.status, 401);
  } finally {
    await service.close();
    await new Promise((resolve) => oauth.issuerServer.close(resolve));
  }
  assert.throws(() => new StudioOAuthVerifier({ resource: "http://studio.example.com", issuer: "https://id.example.com", jwksUri: "https://id.example.com/jwks" }), /HTTPS/);
});
