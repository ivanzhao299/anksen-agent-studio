import { createServer as createHttpServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";
import { AutonomousExecutionCenter } from "./autonomous-execution-center.mjs";
import { GatewayAuthenticator, SlidingWindowRateLimiter, StudioGateway, gatewayErrorResponse } from "./studio-gateway.mjs";

const instructions = "Create goals only when the user explicitly requests a write. Reuse idempotencyKey on retries. Use read tools to inspect Goal, Task Graph, Night Shift Session, Readiness, and Morning Report. This server runs CONTROLLED_STUB only and cannot enable CODEX.";
const asToolResult = (result) => ({ structuredContent: result, content: [{ type: "text", text: JSON.stringify(result) }] });
const toolFailure = (error) => {
  const failure = gatewayErrorResponse(error, "mcp-tool-call").body;
  return { isError: true, structuredContent: failure, content: [{ type: "text", text: JSON.stringify(failure) }] };
};

export function createStudioMcpProtocolServer({ gateway, requestContext }) {
  const server = new McpServer({ name: "anksen-studio-gateway", version: "0.1.0" }, { instructions });
  const register = (name, config, handler) => server.registerTool(name, config, async (input) => {
    try { return asToolResult(await handler(input)); } catch (error) { return toolFailure(error); }
  });

  register("create_goal", {
    title: "Create and run a Studio goal",
    description: "Create one idempotent Goal, invoke the existing Planner and Night Shift, and return its report. This is a write action but cannot enable CODEX.",
    inputSchema: {
      title: z.string().min(1).max(500),
      description: z.string().max(10_000).optional(),
      organizationId: z.string().min(1).optional(),
      workspaceId: z.string().min(1).optional(),
      projectId: z.string().min(1),
      idempotencyKey: z.string().min(1).max(128),
      constraints: z.array(z.string().max(1000)).max(100).default([]),
      acceptanceCriteria: z.array(z.string().max(1000)).max(100).default([]),
    },
    outputSchema: { data: z.record(z.string(), z.any()), meta: z.record(z.string(), z.any()) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (input) => gateway.createGoal(input, requestContext("POST", "/api/v1/goals", input)));

  const goalIdSchema = { goalId: z.string().uuid() };
  const sessionKeySchema = { sessionKey: z.string().min(1) };
  register("get_goal", { title: "Get a Studio goal", description: "Read the authoritative Goal state.", inputSchema: goalIdSchema, outputSchema: { data: z.any(), meta: z.any() }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, ({ goalId }) => gateway.getGoal(goalId, requestContext("GET", `/api/v1/goals/${goalId}`)));
  register("get_task_graph", { title: "Get a Goal task graph", description: "Read authoritative tasks and dependencies for a Goal.", inputSchema: goalIdSchema, outputSchema: { data: z.any(), meta: z.any() }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, ({ goalId }) => gateway.getTaskGraph(goalId, requestContext("GET", `/api/v1/goals/${goalId}/task-graph`)));
  register("get_night_shift_session", { title: "Get a Night Shift session", description: "Read persisted Night Shift session state.", inputSchema: sessionKeySchema, outputSchema: { data: z.any(), meta: z.any() }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, ({ sessionKey }) => gateway.getSession(sessionKey, requestContext("GET", `/api/v1/night-shift/sessions/${sessionKey}`)));
  register("get_activation_readiness", { title: "Get activation readiness", description: "Read controlled-runtime readiness without enabling CODEX.", inputSchema: {}, outputSchema: { data: z.any(), meta: z.any() }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, () => gateway.getReadiness(requestContext("GET", "/api/v1/readiness")));
  register("get_morning_report", { title: "Get a Morning Report", description: "Read the persisted report for a Night Shift session.", inputSchema: sessionKeySchema, outputSchema: { data: z.any(), meta: z.any() }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, ({ sessionKey }) => gateway.getMorningReport(sessionKey, requestContext("GET", `/api/v1/night-shift/sessions/${sessionKey}/morning-report`)));
  return server;
}

function unauthorized(response) {
  response.writeHead(401, { "content-type": "application/json", "www-authenticate": "Bearer", "cache-control": "no-store" });
  response.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Authentication required." }, id: null }));
}

export function createStudioMcpHttpServer({ token, host = "127.0.0.1", port = 4330, executionCenter = new AutonomousExecutionCenter(), rateLimit = 60 } = {}) {
  if (!token || token.length < 16) throw new Error("STUDIO_MCP_BEARER_TOKEN must contain at least 16 characters.");
  const loopback = new Set(["127.0.0.1", "::1", "localhost"]);
  if (!loopback.has(host) && process.env.STUDIO_MCP_ALLOW_REMOTE !== "true") throw new Error("Remote MCP binding requires STUDIO_MCP_ALLOW_REMOTE=true and an external TLS boundary.");
  const authenticator = new GatewayAuthenticator({ serviceTokens: { "studio-mcp": token } });
  const gateway = new StudioGateway({ executionCenter, authenticator, rateLimiter: new SlidingWindowRateLimiter({ limit: rateLimit }) });
  const httpServer = createHttpServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
    if (request.method === "GET" && url.pathname === "/health") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ status: "PASS", transport: "streamable-http", runtime: "CONTROLLED_STUB", codexFeatureFlag: false }));
      return;
    }
    if (url.pathname !== "/mcp") { response.writeHead(404).end(); return; }
    const authorization = String(request.headers.authorization ?? "");
    try { authenticator.authenticate({ method: request.method ?? "GET", pathname: "/mcp", headers: request.headers, body: {} }); } catch { unauthorized(response); return; }
    if (request.method !== "POST") {
      response.writeHead(405, { "content-type": "application/json", allow: "POST" });
      response.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }));
      return;
    }
    const protocol = createStudioMcpProtocolServer({
      gateway,
      requestContext: (method, pathname, body = {}) => ({ method, pathname, headers: { authorization }, body }),
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    response.on("close", () => { transport.close().catch(() => {}); protocol.close().catch(() => {}); });
    try {
      await protocol.connect(transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal MCP server error." }, id: null }));
      }
    }
  });
  return {
    server: httpServer,
    async start() { await new Promise((resolve, reject) => { httpServer.once("error", reject); httpServer.listen(port, host, resolve); }); return httpServer.address(); },
    async close() { if (!httpServer.listening) return; await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve())); },
  };
}
