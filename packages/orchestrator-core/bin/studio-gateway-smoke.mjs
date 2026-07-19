#!/usr/bin/env node
import { AutonomousExecutionCenter } from "../lib/autonomous-execution-center.mjs";
import { GatewayAuthenticator, StudioGateway } from "../lib/studio-gateway.mjs";

const token = "beta-003-local-smoke-token";
const gateway = new StudioGateway({ executionCenter: new AutonomousExecutionCenter(), authenticator: new GatewayAuthenticator({ serviceTokens: { smoke: token } }) });
const input = {
  title: "Beta-003 Studio Gateway smoke",
  description: "Verify ChatGPT-compatible Goal submission without copying a long prompt.",
  projectId: "anksen-agent-studio",
  idempotencyKey: "beta-003-gateway-smoke-v1",
  constraints: ["Use CONTROLLED_STUB only", "Do not enable Codex"],
  acceptanceCriteria: ["Goal succeeds", "Task graph and Morning Report are queryable"],
};
const request = { method: "POST", pathname: "/api/v1/goals", headers: { authorization: `Bearer ${token}` }, body: input };
const created = await gateway.createGoal(input, request);
const goalId = created.data.report.goalId;
const read = (pathname) => ({ method: "GET", pathname, headers: request.headers, body: {} });
const graph = await gateway.getTaskGraph(goalId, read(`/api/v1/goals/${goalId}/task-graph`));
const report = await gateway.getMorningReport(created.data.sessionKey, read(`/api/v1/night-shift/sessions/${created.data.sessionKey}/morning-report`));
const readiness = await gateway.getReadiness(read("/api/v1/readiness"));
if (created.data.report.sessionStatus !== "SUCCEEDED" || graph.data.tasks.length !== 3 || report.data.status !== "SUCCEEDED" || readiness.data.codexFeatureFlag !== false) throw new Error("STUDIO_GATEWAY_SMOKE_FAILED");
console.log(JSON.stringify({ status: "PASS", sessionKey: created.data.sessionKey, goalId, tasks: graph.data.tasks.length, report: report.data.status, runtime: created.meta.runtime, codexFeatureFlag: readiness.data.codexFeatureFlag }, null, 2));
