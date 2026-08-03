import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { evaluateConsoleRouteAccess } from "../../../packages/access-center/lib/access-center-utils.mjs";
import { AgentAdminService } from "./agent-admin-service.mjs";
import { renderConsolePage } from "./render.mjs";

const repoRoot = resolve(new URL("../../..", import.meta.url).pathname);
const owner = { authenticated: true, user: { user_id: "studio-owner" }, roles: [{ role_id: "platform_owner" }], capabilities: ["*"], project_allowlist: ["*"] };

test("Agent admin route is visible only with the dedicated management capability", () => {
  assert.equal(evaluateConsoleRouteAccess("agentAdmin", { capabilities: ["agent.manage", "runtime.read", "worker.read", "credential.read"] }).allowed, true);
  assert.equal(evaluateConsoleRouteAccess("agentAdmin", { capabilities: ["access.manage", "runtime.read", "worker.read", "credential.read"] }).allowed, false);
  assert.equal(evaluateConsoleRouteAccess("agentAdmin", { capabilities: ["runtime.read", "worker.read", "credential.read"] }).allowed, false);
  assert.equal(evaluateConsoleRouteAccess("agentAdmin", owner).allowed, true);
});

test("Agent dashboard merges existing registries without exposing credential values", async () => {
  const service = new AgentAdminService({ repoRoot });
  const dashboard = await service.dashboard();
  assert.ok(dashboard.agents.length >= 6);
  assert.ok(dashboard.agents.some((agent) => agent.adapter_id === "codex-cli"));
  assert.ok(dashboard.agents.some((agent) => agent.workers.some((worker) => worker.worker_id === "local-codex-1")));
  assert.equal(dashboard.policy.credential_values_read, false);
  assert.doesNotMatch(JSON.stringify(dashboard), /"(?:api_key_value|secret_value|private_key_value|password_hash)"\s*:/i);
  assert.deepEqual(Object.keys(dashboard.credentials[0]).sort(), ["credential_id", "credential_type", "provider", "reference_type", "status"]);
});

test("Agent policy writes an atomic overlay and sanitized audit record", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agent-admin-"));
  const configPath = join(directory, "agent-control-config.json");
  const auditPath = join(directory, "agent-control-audit.jsonl");
  const service = new AgentAdminService({ repoRoot, configPath, auditPath });
  const result = await service.updateAgent("codex-cli", {
    enabled: true,
    priority: 5,
    max_parallel_tasks: 3,
    credential_reference_id: "codex-local-session-ref",
    allowed_plan_ids: ["internal_preview", "enterprise"],
    monthly_budget: 800,
    currency: "CNY",
    billing_unit: "task",
    unit_cost: 2.5
  }, { user_id: "studio-owner" });
  assert.equal(result.status, "UPDATED");
  assert.equal(result.agent.priority, 5);
  const stored = JSON.parse(await readFile(configPath, "utf8"));
  assert.equal(stored.agents["codex-cli"].credential_reference_id, "codex-local-session-ref");
  const audit = JSON.parse((await readFile(auditPath, "utf8")).trim());
  assert.equal(audit.actor_user_id, "studio-owner");
  assert.equal(audit.credential_reference_only, true);
  assert.doesNotMatch(JSON.stringify(audit), /secret|password|token|api_key/i);
  await assert.rejects(() => service.updateAgent("codex-cli", { api_key: "must-not-be-accepted" }, owner.user), { code: "SECRET_VALUE_FORBIDDEN" });
});

test("Agent admin page is an operational configuration surface with no secret input", async () => {
  const html = await renderConsolePage("/agent-admin", owner);
  for (const value of ["Agent 控制中心", "仅管理员可见", "/api/admin/agents", "凭证引用", "最大并发任务", "月度预算", "配置审计"]) assert.match(html, new RegExp(value));
  assert.doesNotMatch(html, /name="(?:api_key|secret|password|token)"/i);
  const nonAdmin = await renderConsolePage("/agent-admin", { authenticated: true, user: { user_id: "operator" }, capabilities: ["console.access", "runtime.read", "worker.read", "credential.read"] });
  assert.match(nonAdmin, /当前账号未开通此模块/);
});

test("Agent admin API applies route authorization before reads and writes", async () => {
  const server = await readFile(new URL("./server.mjs", import.meta.url), "utf8");
  for (const value of ["/api/admin/agents", "evaluateConsoleRouteAccess(\"agentAdmin\"", "AGENT_ADMIN_ACCESS_DENIED", "Same-origin confirmation is required", "agentAdminService.updateAgent"]) assert.match(server, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
