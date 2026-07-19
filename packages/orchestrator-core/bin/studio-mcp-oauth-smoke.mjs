#!/usr/bin/env node
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { ensurePostgresFixture } from "../lib/postgres-fixture.mjs";
import { StudioOAuthVerifier } from "../lib/studio-mcp-oauth.mjs";
import { createStudioMcpHttpServer } from "../lib/studio-mcp-server.mjs";

await ensurePostgresFixture();
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
Object.assign(jwk, { kid: "beta-005-smoke", alg: "RS256", use: "sig" });
let issuer;
const issuerServer = createServer((request, response) => {
  response.writeHead(200, { "content-type": "application/json" });
  if (request.url === "/jwks") response.end(JSON.stringify({ keys: [jwk] }));
  else response.end(JSON.stringify({ issuer, jwks_uri: `${issuer}/jwks`, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, code_challenge_methods_supported: ["S256"] }));
});
await new Promise((resolve) => issuerServer.listen(0, "127.0.0.1", resolve));
issuer = `http://127.0.0.1:${issuerServer.address().port}`;
const resource = "http://127.0.0.1:45555";
const token = await new SignJWT({ scope: "studio.goals.read studio.goals.write", organization_id: "studio-org", workspace_id: "studio-workspace", project_ids: ["anksen-agent-studio"], capabilities: ["console.access", "autopilot.plan", "autopilot.execute.local"] })
  .setProtectedHeader({ alg: "RS256", kid: "beta-005-smoke" }).setIssuer(issuer).setAudience(resource).setSubject("beta-005-smoke-user").setJti(randomUUID()).setIssuedAt().setExpirationTime("5m").sign(privateKey);
const oauthVerifier = new StudioOAuthVerifier({ resource, issuer, jwksUri: `${issuer}/jwks`, allowInsecureLocalhost: true });
const service = createStudioMcpHttpServer({ oauthVerifier, port: 0 });
const address = await service.start();
const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
const client = new Client({ name: "anksen-beta-005-oauth-smoke", version: "0.1.0" });
try {
  await client.connect(transport);
  const idempotencyKey = `beta-005-oauth-${Date.now()}`;
  const created = await client.callTool({ name: "create_goal", arguments: { title: "Beta-005 remote MCP OAuth smoke", projectId: "anksen-agent-studio", idempotencyKey, constraints: ["CONTROLLED_STUB only", "OAuth project boundary enforced"], acceptanceCriteria: ["Morning Report is persisted"] } });
  if (created.isError) throw new Error(`OAUTH_MCP_CREATE_FAILED:${created.content?.[0]?.text}`);
  const { goalId } = created.structuredContent.data.report;
  const { sessionKey } = created.structuredContent.data;
  const [goal, graph, report, readiness] = await Promise.all([
    client.callTool({ name: "get_goal", arguments: { goalId } }),
    client.callTool({ name: "get_task_graph", arguments: { goalId } }),
    client.callTool({ name: "get_morning_report", arguments: { sessionKey } }),
    client.callTool({ name: "get_activation_readiness", arguments: {} }),
  ]);
  if (goal.structuredContent.data.project_id !== "anksen-agent-studio" || graph.structuredContent.data.tasks.length !== 3 || report.structuredContent.data.status !== "SUCCEEDED" || readiness.structuredContent.data.codexFeatureFlag !== false) throw new Error("OAUTH_MCP_END_TO_END_ASSERTION_FAILED");
  const denied = await client.callTool({ name: "create_goal", arguments: { title: "Cross-project denial", projectId: "not-authorized", idempotencyKey: `${idempotencyKey}-denied` } });
  if (!denied.isError || !denied.content?.[0]?.text?.includes("PROJECT_ACCESS_DENIED")) throw new Error("OAUTH_PROJECT_BOUNDARY_FAILED");
  console.log(JSON.stringify({ status: "PASS", auth: "oauth2-jwt-jwks", pkceDiscovery: "S256", goalId, sessionKey, tasks: 3, morningReport: "SUCCEEDED", projectBoundary: "PASS", runtime: "CONTROLLED_STUB", codexFeatureFlag: false }, null, 2));
} finally {
  await transport.close().catch(() => {});
  await service.close();
  await new Promise((resolve) => issuerServer.close(resolve));
}
