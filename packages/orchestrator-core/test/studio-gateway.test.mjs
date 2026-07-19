import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { GatewayAuthenticator, GatewayError, SlidingWindowRateLimiter, StudioGateway } from "../lib/studio-gateway.mjs";

const executionCenter = {
  calls: [],
  async createGoal(input) { this.calls.push(input); return { sessionKey: "aec-1", report: { sessionStatus: "SUCCEEDED" } }; },
  async getGoal(id) { return { id }; },
  async getTaskGraph(id) { return { goal: { id }, tasks: [], dependencies: [] }; },
  async getSession(sessionKey) { return { session_key: sessionKey }; },
  async getReadiness() { return { status: "READY_FOR_CONTROLLED_STUB", codexFeatureFlag: false }; },
  async getMorningReport(sessionKey) { return { sessionKey, status: "SUCCEEDED", report: {} }; },
};
const context = (authorization = "Bearer local-secret", body = {}) => ({ method: "POST", pathname: "/api/v1/goals", headers: { authorization }, body });

test("service token authenticates an idempotent CONTROLLED_STUB goal", async () => {
  const gateway = new StudioGateway({ executionCenter, authenticator: new GatewayAuthenticator({ serviceTokens: { chatgpt: "local-secret" } }) });
  const input = { title: "Beta-003 smoke", projectId: "studio", idempotencyKey: "beta-003", constraints: ["No Codex"], acceptanceCriteria: ["Report exists"] };
  const result = await gateway.createGoal(input, context(undefined, input));
  assert.equal(result.data.sessionKey, "aec-1");
  assert.equal(result.meta.runtime, "CONTROLLED_STUB");
  assert.deepEqual(executionCenter.calls.at(-1).constraints, ["No Codex"]);
});

test("HMAC authentication rejects replay and expired timestamps", () => {
  const now = Date.parse("2026-07-19T01:00:00.000Z");
  const auth = new GatewayAuthenticator({ signingSecrets: { client: "signing-secret" }, now: () => now });
  const body = {};
  const timestamp = new Date(now).toISOString(), nonce = "nonce-1";
  const bodyHash = "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a";
  const signature = createHmac("sha256", "signing-secret").update(`${timestamp}\n${nonce}\nGET\n/api/v1/readiness\n${bodyHash}`).digest("hex");
  const request = { method: "GET", pathname: "/api/v1/readiness", body, headers: { "x-anksen-key-id": "client", "x-anksen-timestamp": timestamp, "x-anksen-nonce": nonce, "x-anksen-signature": signature } };
  assert.equal(auth.authenticate(request).principalId, "client");
  assert.throws(() => auth.authenticate(request), (error) => error.code === "SIGNATURE_REPLAY");
  assert.throws(() => new GatewayAuthenticator({ signingSecrets: { client: "signing-secret" }, now: () => now + 600_000 }).authenticate({ ...request, headers: { ...request.headers, "x-anksen-nonce": "nonce-2" } }), (error) => error.code === "SIGNATURE_EXPIRED");
});

test("rate limiter returns a stable 429 error", () => {
  const limiter = new SlidingWindowRateLimiter({ limit: 1, now: () => 1000 });
  limiter.consume("client");
  assert.throws(() => limiter.consume("client"), (error) => error instanceof GatewayError && error.status === 429);
});

test("read tools reuse the execution center and never enable Codex", async () => {
  const gateway = new StudioGateway({ executionCenter, authenticator: new GatewayAuthenticator({ serviceTokens: { chatgpt: "local-secret" } }) });
  const get = { method: "GET", pathname: "/api/v1/readiness", headers: { authorization: "Bearer local-secret" }, body: {} };
  assert.equal((await gateway.getReadiness(get)).data.codexFeatureFlag, false);
  assert.equal((await gateway.getGoal("goal-1", get)).data.id, "goal-1");
  assert.equal((await gateway.getMorningReport("session-1", get)).data.status, "SUCCEEDED");
});
