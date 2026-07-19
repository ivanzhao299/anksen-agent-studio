#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { randomUUID } from "node:crypto";
import { createStudioMcpHttpServer } from "../lib/studio-mcp-server.mjs";

const token = randomUUID();
const service = createStudioMcpHttpServer({ token, port: 0 });
const address = await service.start();
const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
const client = new Client({ name: "anksen-beta-004-smoke", version: "0.1.0" });
try {
  await client.connect(transport);
  const tools = await client.listTools();
  const expected = ["create_goal", "get_activation_readiness", "get_goal", "get_morning_report", "get_night_shift_session", "get_task_graph"];
  const names = tools.tools.map((tool) => tool.name).sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error(`MCP_TOOL_LIST_MISMATCH:${names.join(",")}`);
  const created = await client.callTool({ name: "create_goal", arguments: { title: "Beta-004 MCP smoke documentation", projectId: "anksen-agent-studio", idempotencyKey: "beta-004-mcp-smoke-v1", constraints: ["CONTROLLED_STUB only"], acceptanceCriteria: ["Morning Report is queryable"] } });
  if (created.isError) throw new Error(`MCP_CREATE_GOAL_FAILED:${JSON.stringify(created)}`);
  const payload = created.structuredContent;
  const goalId = payload.data.report.goalId;
  const sessionKey = payload.data.sessionKey;
  const [graph, report, readiness] = await Promise.all([
    client.callTool({ name: "get_task_graph", arguments: { goalId } }),
    client.callTool({ name: "get_morning_report", arguments: { sessionKey } }),
    client.callTool({ name: "get_activation_readiness", arguments: {} }),
  ]);
  if (graph.structuredContent.data.tasks.length !== 3 || report.structuredContent.data.status !== "SUCCEEDED" || readiness.structuredContent.data.codexFeatureFlag !== false) throw new Error("MCP_END_TO_END_ASSERTION_FAILED");
  console.log(JSON.stringify({ status: "PASS", transport: "streamable-http", tools: names, goalId, sessionKey, tasks: 3, morningReport: "SUCCEEDED", runtime: "CONTROLLED_STUB", codexFeatureFlag: false }, null, 2));
} finally {
  await transport.close().catch(() => {});
  await service.close();
}
