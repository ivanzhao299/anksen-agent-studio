import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export class GatewayError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
};
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const digest = (value) => createHash("sha256").update(JSON.stringify(canonical(value ?? {}))).digest("hex");

export class GatewayAuthenticator {
  constructor({ serviceTokens = {}, signingSecrets = {}, maxClockSkewSeconds = 300, now = () => Date.now() } = {}) {
    this.serviceTokens = serviceTokens;
    this.signingSecrets = signingSecrets;
    this.maxClockSkewSeconds = maxClockSkewSeconds;
    this.now = now;
    this.nonces = new Map();
  }

  authenticate({ method, pathname, headers = {}, body = {}, sessionContext = null }) {
    if (sessionContext?.authenticated) return { ...sessionContext, principalId: sessionContext.user?.user_id ?? "studio-user", authType: "session" };
    const authorization = String(headers.authorization ?? "");
    if (authorization.startsWith("Bearer ")) {
      const presented = authorization.slice(7);
      const match = Object.entries(this.serviceTokens).find(([, token]) => safeEqual(token, presented));
      if (!match) throw new GatewayError("AUTH_INVALID", "Invalid service token.", 401);
      return this.serviceContext(match[0], "service_token");
    }
    const keyId = String(headers["x-anksen-key-id"] ?? "");
    const timestamp = String(headers["x-anksen-timestamp"] ?? "");
    const nonce = String(headers["x-anksen-nonce"] ?? "");
    const signature = String(headers["x-anksen-signature"] ?? "");
    const secret = this.signingSecrets[keyId];
    if (!keyId || !timestamp || !nonce || !signature || !secret) throw new GatewayError("AUTH_REQUIRED", "Bearer token or signed request required.", 401);
    const timestampMs = Date.parse(timestamp);
    if (!Number.isFinite(timestampMs) || Math.abs(this.now() - timestampMs) > this.maxClockSkewSeconds * 1000) throw new GatewayError("SIGNATURE_EXPIRED", "Request timestamp is outside the allowed window.", 401);
    this.pruneNonces();
    const nonceKey = `${keyId}:${nonce}`;
    if (this.nonces.has(nonceKey)) throw new GatewayError("SIGNATURE_REPLAY", "Request nonce was already used.", 409);
    const payload = `${timestamp}\n${nonce}\n${method.toUpperCase()}\n${pathname}\n${digest(body)}`;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    if (!safeEqual(expected, signature)) throw new GatewayError("SIGNATURE_INVALID", "Request signature is invalid.", 401);
    this.nonces.set(nonceKey, timestampMs);
    return this.serviceContext(keyId, "hmac_sha256");
  }

  pruneNonces() {
    const cutoff = this.now() - this.maxClockSkewSeconds * 1000;
    for (const [key, timestamp] of this.nonces) if (timestamp < cutoff) this.nonces.delete(key);
  }

  serviceContext(principalId, authType) {
    return {
      authenticated: true,
      principalId,
      authType,
      user: { user_id: principalId },
      capabilities: ["console.access", "autopilot.plan", "autopilot.execute.local"],
      gatewayService: true,
    };
  }
}

export class SlidingWindowRateLimiter {
  constructor({ limit = 30, windowMs = 60_000, now = () => Date.now() } = {}) { this.limit = limit; this.windowMs = windowMs; this.now = now; this.hits = new Map(); }
  consume(key) {
    const cutoff = this.now() - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((time) => time > cutoff);
    if (recent.length >= this.limit) throw new GatewayError("RATE_LIMITED", "Gateway rate limit exceeded.", 429, { retryAfterSeconds: Math.ceil((recent[0] + this.windowMs - this.now()) / 1000) });
    recent.push(this.now()); this.hits.set(key, recent);
    return { limit: this.limit, remaining: this.limit - recent.length, resetAt: new Date(recent[0] + this.windowMs).toISOString() };
  }
}

function validateGoal(input) {
  const title = String(input?.title ?? "").trim();
  const idempotencyKey = String(input?.idempotencyKey ?? "").trim();
  if (!title) throw new GatewayError("INVALID_GOAL", "title is required.");
  if (!idempotencyKey || idempotencyKey.length > 128) throw new GatewayError("INVALID_IDEMPOTENCY_KEY", "idempotencyKey is required and must be at most 128 characters.");
  const constraints = input.constraints ?? [];
  const acceptanceCriteria = input.acceptanceCriteria ?? [];
  if (!Array.isArray(constraints) || !constraints.every((item) => typeof item === "string")) throw new GatewayError("INVALID_CONSTRAINTS", "constraints must be an array of strings.");
  if (!Array.isArray(acceptanceCriteria) || !acceptanceCriteria.every((item) => typeof item === "string")) throw new GatewayError("INVALID_ACCEPTANCE", "acceptanceCriteria must be an array of strings.");
  return { title, description: String(input.description ?? ""), constraints, acceptanceCriteria, idempotencyKey };
}

export class StudioGateway {
  constructor({ executionCenter, authenticator = new GatewayAuthenticator(), rateLimiter = new SlidingWindowRateLimiter() } = {}) {
    if (!executionCenter) throw new GatewayError("EXECUTION_CENTER_REQUIRED", "Autonomous Execution Center is required.", 500);
    this.executionCenter = executionCenter; this.authenticator = authenticator; this.rateLimiter = rateLimiter;
  }

  authorize(request) {
    const actor = this.authenticator.authenticate(request);
    const rate = this.rateLimiter.consume(actor.principalId);
    return { actor, rate };
  }

  async createGoal(input, context) {
    const { actor, rate } = this.authorize(context);
    const goal = validateGoal(input);
    const scope = {
      organizationId: String(input.organizationId ?? actor.organizationId ?? "studio-org"),
      workspaceId: String(input.workspaceId ?? actor.workspaceId ?? "studio-workspace"),
      projectId: String(input.projectId ?? "studio-project"),
    };
    const result = await this.executionCenter.createGoal({ ...goal, scope, userContext: actor });
    return { data: result, meta: { idempotencyKey: goal.idempotencyKey, runtime: "CONTROLLED_STUB", rate } };
  }

  async getGoal(goalId, context) { const { rate } = this.authorize(context); return { data: await this.executionCenter.getGoal(goalId), meta: { rate } }; }
  async getTaskGraph(goalId, context) { const { rate } = this.authorize(context); return { data: await this.executionCenter.getTaskGraph(goalId), meta: { rate } }; }
  async getSession(sessionKey, context) { const { rate } = this.authorize(context); return { data: await this.executionCenter.getSession(sessionKey), meta: { rate } }; }
  async getReadiness(context) { const { rate } = this.authorize(context); return { data: await this.executionCenter.getReadiness(), meta: { rate } }; }
  async getMorningReport(sessionKey, context) { const { rate } = this.authorize(context); return { data: await this.executionCenter.getMorningReport(sessionKey), meta: { rate } }; }
}

export function gatewayErrorResponse(error, requestId) {
  const known = error instanceof GatewayError;
  return {
    status: known ? error.status : 500,
    body: { error: { code: known ? error.code : (error?.code ?? "INTERNAL_ERROR"), message: known ? error.message : "Gateway request failed.", requestId, details: known ? error.details : undefined } },
  };
}

export const studioGatewayMcpTools = [
  { name: "create_goal", title: "Create and run a Studio goal", description: "Creates one idempotent goal, plans it, submits its task graph, and runs the controlled Night Shift. Real Codex remains gated.", readOnlyHint: false },
  { name: "get_goal", title: "Get a Studio goal", description: "Returns the authoritative goal state.", readOnlyHint: true },
  { name: "get_task_graph", title: "Get a goal task graph", description: "Returns authoritative tasks and dependencies for a goal.", readOnlyHint: true },
  { name: "get_night_shift_session", title: "Get a Night Shift session", description: "Returns persisted Night Shift session state.", readOnlyHint: true },
  { name: "get_activation_readiness", title: "Get runtime readiness", description: "Returns current controlled-runtime readiness. It never enables Codex.", readOnlyHint: true },
  { name: "get_morning_report", title: "Get a Morning Report", description: "Returns the persisted report for a Night Shift session.", readOnlyHint: true },
];
