import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createStudioMcpHttpServer } from "../lib/studio-mcp-server.mjs";

const fakeExecutionCenter = {
  async createGoal(input) { return { sessionKey: "session-1", report: { goalId: "11111111-1111-4111-8111-111111111111", sessionStatus: "SUCCEEDED" }, received: input }; },
  async getGoal(id) { return { id, status: "SUCCEEDED" }; },
  async getTaskGraph(id) { return { goal: { id }, tasks: [], dependencies: [] }; },
  async getSession(sessionKey) { return { session_key: sessionKey, status: "SUCCEEDED" }; },
  async getReadiness() { return { status: "READY_FOR_CONTROLLED_STUB", codexFeatureFlag: false }; },
  async getMorningReport(sessionKey) { return { sessionKey, status: "SUCCEEDED", report: {} }; },
};

test("MCP Streamable HTTP lists six tools and calls read/write Gateway handlers", async () => {
  const token = "unit-test-mcp-token-value";
  const service = createStudioMcpHttpServer({ token, port: 0, executionCenter: fakeExecutionCenter });
  const address = await service.start();
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  const client = new Client({ name: "studio-mcp-test", version: "0.1.0" });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 6);
    assert.equal(tools.tools.find((tool) => tool.name === "create_goal").annotations.readOnlyHint, false);
    assert.equal(tools.tools.find((tool) => tool.name === "get_goal").annotations.readOnlyHint, true);
    const readiness = await client.callTool({ name: "get_activation_readiness", arguments: {} });
    assert.equal(readiness.structuredContent.data.codexFeatureFlag, false);
    const created = await client.callTool({ name: "create_goal", arguments: { title: "test", projectId: "studio", idempotencyKey: "mcp-test-1" } });
    assert.equal(created.structuredContent.meta.runtime, "CONTROLLED_STUB");
  } finally {
    await transport.close().catch(() => {});
    await service.close();
  }
});

test("MCP endpoint rejects missing credentials and unsafe remote binding", async () => {
  const service = createStudioMcpHttpServer({ token: "unit-test-mcp-token-value", port: 0, executionCenter: fakeExecutionCenter });
  const address = await service.start();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("www-authenticate"), "Bearer");
  } finally { await service.close(); }
  assert.throws(() => createStudioMcpHttpServer({ token: "unit-test-mcp-token-value", host: "0.0.0.0", executionCenter: fakeExecutionCenter }), /STUDIO_MCP_ALLOW_REMOTE/);
});

test("MCP readiness probe reports safe runtime state and can fail closed", async () => {
  const ready = createStudioMcpHttpServer({ token: "unit-test-mcp-token-value", port: 0, executionCenter: fakeExecutionCenter, readiness: { status: "READY", authentication: "local_bearer" } });
  const readyAddress = await ready.start();
  try {
    const response = await fetch(`http://127.0.0.1:${readyAddress.port}/ready`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.runtime, "CONTROLLED_STUB");
    assert.equal(payload.codexFeatureFlag, false);
  } finally { await ready.close(); }
  const blocked = createStudioMcpHttpServer({ token: "unit-test-mcp-token-value", port: 0, executionCenter: fakeExecutionCenter, readiness: { status: "NOT_READY", authentication: "oauth2" } });
  const blockedAddress = await blocked.start();
  try { assert.equal((await fetch(`http://127.0.0.1:${blockedAddress.port}/ready`)).status, 503); } finally { await blocked.close(); }
});
