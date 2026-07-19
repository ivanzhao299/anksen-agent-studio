#!/usr/bin/env node
import { createStudioMcpHttpServer } from "../lib/studio-mcp-server.mjs";

const service = createStudioMcpHttpServer({
  token: process.env.STUDIO_MCP_BEARER_TOKEN,
  host: process.env.STUDIO_MCP_HOST ?? "127.0.0.1",
  port: Number(process.env.STUDIO_MCP_PORT ?? 4330),
  rateLimit: Number(process.env.STUDIO_MCP_RATE_LIMIT ?? 60),
});
const address = await service.start();
console.log(`ANKSEN Studio MCP listening on http://${address.address}:${address.port}/mcp`);
console.log("Runtime: CONTROLLED_STUB; CODEX activation is unavailable through this server.");
const shutdown = async () => { await service.close(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
