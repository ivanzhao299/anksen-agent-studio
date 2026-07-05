import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const libDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(libDir, "..");
const repoRoot = resolve(packageRoot, "../..");

const examplePaths = {
  policy: resolve(packageRoot, "examples/access-policy.example.json"),
  users: resolve(packageRoot, "examples/studio-users.example.json"),
  memberships: resolve(packageRoot, "examples/workspace-memberships.example.json"),
  plans: resolve(packageRoot, "examples/plan-entitlements.example.json")
};

const runtimePaths = {
  state: resolve(repoRoot, "runtime/global/access-state.json"),
  users: resolve(repoRoot, "runtime/global/access-users.json"),
  memberships: resolve(repoRoot, "runtime/global/access-memberships.json")
};

const riskOrder = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const consoleActionCatalog = {
  "workspace-goal": { capabilities: ["console.access", "autopilot.plan"], execution_mode: "dry_run_only", projectScoped: true },
  "agent-real-plan": { capabilities: ["console.access", "agent.runtime.readonly"], execution_mode: "direct_execute", projectScoped: true },
  "ai-runtime-status": { capabilities: ["console.access", "agent.runtime.status"], execution_mode: "dry_run_only", projectScoped: false },
  "goal-plan": { capabilities: ["console.access", "autopilot.plan"], execution_mode: "dry_run_only", projectScoped: true },
  "context-summary": { capabilities: ["console.access", "context.read"], execution_mode: "dry_run_only", projectScoped: false },
  "project-inspect": { capabilities: ["console.access", "project.read"], execution_mode: "dry_run_only", projectScoped: true },
  "runtime-health": { capabilities: ["console.access", "runtime.read"], execution_mode: "dry_run_only", projectScoped: false },
  "worker-health": { capabilities: ["console.access", "worker.read"], execution_mode: "dry_run_only", projectScoped: false },
  "governance-check": { capabilities: ["console.access", "governance.read"], execution_mode: "dry_run_only", projectScoped: false },
  "autopilot-dry-run": { capabilities: ["console.access", "autopilot.plan"], execution_mode: "dry_run_only", projectScoped: true },
  "autopilot-execute": { capabilities: ["console.access", "autopilot.execute.local"], execution_mode: "direct_execute", projectScoped: true },
  "smart-park-continue": { capabilities: ["console.access", "smart_park.workspace", "autopilot.execute.local"], execution_mode: "direct_execute", projectScoped: true },
  "smart-park-blockers": { capabilities: ["console.access", "smart_park.workspace", "project.read"], execution_mode: "direct_execute", projectScoped: true },
  "smart-park-go-live-plan": { capabilities: ["console.access", "smart_park.workspace", "proposal.create"], execution_mode: "proposal_only", projectScoped: true },
  "proposal-review": { capabilities: ["console.access", "proposal.review"], execution_mode: "proposal_only", projectScoped: true },
  "proposal-approve-dry-run": { capabilities: ["console.access", "proposal.approve"], execution_mode: "proposal_only", projectScoped: true },
  "proposal-reject-draft": { capabilities: ["console.access", "proposal.reject"], execution_mode: "proposal_only", projectScoped: true },
  "production-operation-request": { capabilities: ["console.access", "production.request"], execution_mode: "human_approval_required", projectScoped: true }
};

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function rankRisk(risk) {
  const index = riskOrder.indexOf(risk);
  return index >= 0 ? index : riskOrder.length - 1;
}

function lowerRisk(left, right) {
  return rankRisk(left) <= rankRisk(right) ? left : right;
}

async function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

function maskSession(session) {
  if (!session) return null;
  return {
    session_id: session.session_id,
    workspace_id: session.workspace_id,
    user_id: session.user_id,
    auth_source: session.auth_source,
    created_at: session.created_at,
    expires_at: session.expires_at,
    last_seen_at: session.last_seen_at,
    bind_address: session.bind_address
  };
}

function passwordHash(password, salt) {
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(storedHash, password) {
  const [algorithm, salt, digest] = String(storedHash ?? "").split("$");
  if (algorithm !== "scrypt" || !salt || !digest) return false;
  const calculated = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(calculated, "hex"), Buffer.from(digest, "hex"));
}

function roleDefinition(bundle, roleId) {
  return (bundle.policy.roles ?? []).find((role) => role.role_id === roleId) ?? null;
}

function planDefinition(bundle, planId) {
  return (bundle.plans.plans ?? []).find((plan) => plan.plan_id === planId) ?? null;
}

function membershipDefinition(bundle, userId, workspaceId) {
  return (bundle.memberships.memberships ?? []).find((membership) =>
    membership.user_id === userId
    && membership.workspace_id === workspaceId
    && membership.status === "ACTIVE"
  ) ?? null;
}

function capabilitySetFromProfile(profile) {
  const set = new Set(profile?.capabilities ?? []);
  return set;
}

function hasCapability(profile, capability) {
  const capabilities = capabilitySetFromProfile(profile);
  return capabilities.has("*") || capabilities.has(capability);
}

function projectAllowed(profile, projectId) {
  if (!projectId) return true;
  const allowlist = profile?.project_allowlist ?? [];
  return allowlist.includes("*") || allowlist.includes(projectId);
}

function defaultAnonymousContext(bundle) {
  return {
    authenticated: false,
    auth_source: "anonymous",
    user: null,
    membership: null,
    roles: [],
    plan: null,
    capabilities: [],
    feature_flags: [],
    direct_execute_max_risk: "LOW",
    project_allowlist: [],
    can_manage_access: false,
    workspace_id: bundle.state.workspace_id ?? bundle.policy.default_workspace_id
  };
}

function buildProfile(bundle, user) {
  if (!user || user.status !== "ACTIVE") return defaultAnonymousContext(bundle);
  const workspaceId = bundle.state.workspace_id ?? bundle.policy.default_workspace_id;
  const membership = membershipDefinition(bundle, user.user_id, workspaceId);
  const roleIds = unique([...(user.role_ids ?? []), ...(membership?.role_ids ?? [])]);
  const roles = roleIds.map((roleId) => roleDefinition(bundle, roleId)).filter(Boolean);
  const plan = planDefinition(bundle, membership?.plan_id ?? user.default_plan_id);
  const capabilities = unique([
    ...(plan?.capabilities ?? []),
    ...roles.flatMap((role) => role.capabilities ?? [])
  ]);
  const featureFlags = unique([
    ...(plan?.beta_features ?? []),
    ...(user.feature_overrides ?? []),
    ...(membership?.beta_features ?? [])
  ]);
  const directExecuteMaxRisk = roles.reduce(
    (current, role) => lowerRisk(current, role.direct_execute_max_risk ?? current),
    plan?.direct_execute_max_risk ?? "LOW"
  );
  return {
    authenticated: true,
    auth_source: bundle.policy.auth_mode,
    user: sanitizeUser(user),
    membership,
    roles,
    plan,
    capabilities,
    feature_flags: featureFlags,
    direct_execute_max_risk: directExecuteMaxRisk,
    project_allowlist: membership?.project_allowlist ?? [],
    can_manage_access: roles.some((role) => role.can_manage_access === true),
    workspace_id: workspaceId
  };
}

function bundleIndexes(bundle) {
  return {
    usersById: new Map((bundle.users.users ?? []).map((user) => [user.user_id, user])),
    usersByUsername: new Map((bundle.users.users ?? []).map((user) => [String(user.username).toLowerCase(), user]))
  };
}

function sessionStorePath(bundle) {
  return resolve(repoRoot, bundle.state.session_store_path ?? "runtime/local-services/access-sessions.json");
}

async function readSessionStore(bundle) {
  const storePath = sessionStorePath(bundle);
  const store = await readJson(storePath, {
    schema_version: 1,
    workspace_id: bundle.state.workspace_id ?? bundle.policy.default_workspace_id,
    sessions: []
  });
  const now = Date.now();
  const sessions = (store.sessions ?? []).filter((session) => Date.parse(session.expires_at ?? "") > now);
  if (sessions.length !== (store.sessions ?? []).length) {
    await writeJson(storePath, {
      schema_version: 1,
      workspace_id: store.workspace_id ?? bundle.state.workspace_id ?? bundle.policy.default_workspace_id,
      sessions
    });
  }
  return {
    path: storePath,
    data: {
      schema_version: 1,
      workspace_id: store.workspace_id ?? bundle.state.workspace_id ?? bundle.policy.default_workspace_id,
      sessions
    }
  };
}

async function writeSessionStore(bundle, sessions) {
  const storePath = sessionStorePath(bundle);
  await writeJson(storePath, {
    schema_version: 1,
    workspace_id: bundle.state.workspace_id ?? bundle.policy.default_workspace_id,
    sessions
  });
  return storePath;
}

export async function loadAccessCenter() {
  const [policy, plans, state, users, memberships] = await Promise.all([
    readJson(examplePaths.policy, {}),
    readJson(examplePaths.plans, {}),
    readJson(runtimePaths.state, {}),
    readJson(existsSync(runtimePaths.users) ? runtimePaths.users : examplePaths.users, {}),
    readJson(existsSync(runtimePaths.memberships) ? runtimePaths.memberships : examplePaths.memberships, {})
  ]);

  const bundle = {
    policy,
    plans,
    state,
    users,
    memberships,
    paths: {
      ...examplePaths,
      state: runtimePaths.state,
      users: existsSync(runtimePaths.users) ? runtimePaths.users : examplePaths.users,
      memberships: existsSync(runtimePaths.memberships) ? runtimePaths.memberships : examplePaths.memberships
    }
  };
  return {
    ...bundle,
    indexes: bundleIndexes(bundle),
    session_store_path: sessionStorePath(bundle)
  };
}

export function listStudioUsers(bundle) {
  return (bundle.users.users ?? []).map((user) => {
    const profile = buildProfile(bundle, user);
    return {
      ...sanitizeUser(user),
      workspace_id: profile.workspace_id,
      plan_id: profile.plan?.plan_id ?? user.default_plan_id,
      plan_name: profile.plan?.display_name ?? user.default_plan_id,
      effective_roles: profile.roles.map((role) => role.role_id),
      feature_flags: profile.feature_flags,
      direct_execute_max_risk: profile.direct_execute_max_risk
    };
  });
}

export function listPlanEntitlements(bundle) {
  return (bundle.plans.plans ?? []).map((plan) => ({
    plan_id: plan.plan_id,
    display_name: plan.display_name,
    tier: plan.tier,
    capability_count: (plan.capabilities ?? []).length,
    beta_feature_count: (plan.beta_features ?? []).length,
    direct_execute_max_risk: plan.direct_execute_max_risk,
    seat_limit: plan.seat_limit
  }));
}

export function accessSummary(bundle, context = null) {
  const current = context?.user ? context : defaultAnonymousContext(bundle);
  return {
    policy_id: bundle.policy.policy_id,
    workspace_id: bundle.state.workspace_id ?? bundle.policy.default_workspace_id,
    auth_mode: bundle.policy.auth_mode,
    allow_anonymous_console_read: bundle.policy.allow_anonymous_console_read,
    default_console_user_id: bundle.policy.default_console_user_id,
    session_ttl_hours: bundle.policy.session_ttl_hours,
    session_store_path: bundle.session_store_path,
    role_count: (bundle.policy.roles ?? []).length,
    user_count: (bundle.users.users ?? []).length,
    membership_count: (bundle.memberships.memberships ?? []).length,
    plan_count: (bundle.plans.plans ?? []).length,
    authenticated: current.authenticated,
    current_user: current.user,
    current_plan: current.plan ? {
      plan_id: current.plan.plan_id,
      display_name: current.plan.display_name,
      tier: current.plan.tier
    } : null,
    current_roles: current.roles.map((role) => role.role_id),
    direct_execute_max_risk: current.direct_execute_max_risk
  };
}

export function resolveUserProfile(bundle, userOrUsername) {
  const value = String(userOrUsername ?? "").trim();
  if (!value) return defaultAnonymousContext(bundle);
  const user = bundle.indexes.usersById.get(value)
    ?? bundle.indexes.usersByUsername.get(value.toLowerCase())
    ?? null;
  return buildProfile(bundle, user);
}

export async function authenticateLocalUser(bundle, username, password) {
  const user = bundle.indexes.usersByUsername.get(String(username ?? "").toLowerCase()) ?? null;
  if (!user || user.status !== "ACTIVE") {
    return {
      status: "DENY",
      reason: "用户名不存在或账号未启用。",
      context: defaultAnonymousContext(bundle)
    };
  }
  if (!verifyPassword(user.password_hash, String(password ?? ""))) {
    return {
      status: "DENY",
      reason: "密码不正确。",
      context: defaultAnonymousContext(bundle)
    };
  }
  return {
    status: "ALLOW",
    reason: "登录成功。",
    context: buildProfile(bundle, user)
  };
}

export async function createLocalSession(bundle, context, metadata = {}) {
  if (!context?.authenticated || !context?.user?.user_id) {
    throw new Error("Authenticated user context is required before creating a session.");
  }
  const { data } = await readSessionStore(bundle);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Number(bundle.policy.session_ttl_hours ?? 12) * 60 * 60 * 1000);
  const session = {
    session_id: `session-${randomUUID()}`,
    session_token: randomUUID(),
    workspace_id: context.workspace_id,
    user_id: context.user.user_id,
    auth_source: bundle.policy.auth_mode,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    last_seen_at: now.toISOString(),
    bind_address: "127.0.0.1",
    user_agent: String(metadata.user_agent ?? "unknown").slice(0, 240)
  };
  const nextSessions = [...(data.sessions ?? []).filter((item) => item.user_id !== session.user_id), session];
  await writeSessionStore(bundle, nextSessions);
  return {
    token: session.session_token,
    session: maskSession(session)
  };
}

export async function revokeLocalSession(bundle, token) {
  const { data } = await readSessionStore(bundle);
  const nextSessions = (data.sessions ?? []).filter((session) => session.session_token !== token);
  await writeSessionStore(bundle, nextSessions);
  return nextSessions.length !== (data.sessions ?? []).length;
}

export async function resolveSessionContext(bundle, options = {}) {
  const token = String(options.session_token ?? "").trim();
  const allowDefaultUser = options.allow_default_user === true;
  if (!token) {
    return allowDefaultUser
      ? resolveUserProfile(bundle, bundle.policy.default_console_user_id)
      : defaultAnonymousContext(bundle);
  }
  const { data } = await readSessionStore(bundle);
  const session = (data.sessions ?? []).find((item) => item.session_token === token) ?? null;
  if (!session) return allowDefaultUser ? resolveUserProfile(bundle, bundle.policy.default_console_user_id) : defaultAnonymousContext(bundle);
  const user = bundle.indexes.usersById.get(session.user_id) ?? null;
  const context = buildProfile(bundle, user);
  return {
    ...context,
    session: maskSession(session)
  };
}

export async function currentSessionSummary(bundle, token, options = {}) {
  const context = await resolveSessionContext(bundle, {
    session_token: token,
    allow_default_user: options.allow_default_user === true
  });
  return {
    authenticated: context.authenticated,
    auth_source: context.auth_source,
    user: context.user,
    membership: context.membership ? {
      membership_id: context.membership.membership_id,
      workspace_id: context.membership.workspace_id,
      plan_id: context.membership.plan_id,
      project_allowlist: context.membership.project_allowlist
    } : null,
    roles: context.roles.map((role) => ({
      role_id: role.role_id,
      display_name: role.display_name
    })),
    plan: context.plan ? {
      plan_id: context.plan.plan_id,
      display_name: context.plan.display_name,
      tier: context.plan.tier
    } : null,
    direct_execute_max_risk: context.direct_execute_max_risk,
    feature_flags: context.feature_flags,
    session: context.session ?? null
  };
}

function actionCapabilities(actionId) {
  return consoleActionCatalog[actionId]?.capabilities ?? ["console.access"];
}

export async function evaluateConsoleActionAccess(bundle, input = {}, options = {}) {
  const actionId = String(input.action_id ?? input.actionId ?? "").trim();
  const projectId = String(input.project_id ?? input.projectId ?? "").trim();
  const risk = riskOrder.includes(input.risk) ? input.risk : "LOW";
  const attachmentCount = Number(input.attachment_count ?? input.attachmentCount ?? 0);
  const context = options.user_context
    ?? await resolveSessionContext(bundle, {
      session_token: options.session_token,
      allow_default_user: options.allow_default_user === true
    });

  const action = consoleActionCatalog[actionId] ?? null;
  if (!context.authenticated) {
    return {
      status: "DENY",
      execution_mode: "dry_run_only",
      required_capabilities: actionCapabilities(actionId),
      missing_capabilities: actionCapabilities(actionId),
      effective_capabilities: [],
      direct_execute_max_risk: "LOW",
      project_scope: [],
      reason: "当前 Console 动作需要先登录本地 Studio 账号。"
    };
  }
  if (!action) {
    return {
      status: "DENY",
      execution_mode: "dry_run_only",
      required_capabilities: [],
      missing_capabilities: [],
      effective_capabilities: context.capabilities,
      direct_execute_max_risk: context.direct_execute_max_risk,
      project_scope: context.project_allowlist,
      reason: `未注册的 Console 动作：${actionId}`
    };
  }
  if (action.projectScoped && !projectAllowed(context, projectId)) {
    return {
      status: "DENY",
      execution_mode: action.execution_mode,
      required_capabilities: action.capabilities,
      missing_capabilities: [],
      effective_capabilities: context.capabilities,
      direct_execute_max_risk: context.direct_execute_max_risk,
      project_scope: context.project_allowlist,
      reason: `账号 ${context.user.username} 未被授权访问项目 ${projectId}。`
    };
  }

  const requiredCapabilities = [...action.capabilities];
  if (attachmentCount > 0) requiredCapabilities.push("console.attachments");
  const missingCapabilities = requiredCapabilities.filter((capability) => !hasCapability(context, capability));
  if (missingCapabilities.length > 0) {
    return {
      status: "DENY",
      execution_mode: action.execution_mode,
      required_capabilities: requiredCapabilities,
      missing_capabilities: missingCapabilities,
      effective_capabilities: context.capabilities,
      direct_execute_max_risk: context.direct_execute_max_risk,
      project_scope: context.project_allowlist,
      reason: `缺少能力：${missingCapabilities.join(", ")}`
    };
  }

  if (action.execution_mode === "direct_execute" && rankRisk(risk) > rankRisk(context.direct_execute_max_risk)) {
    return {
      status: "DENY",
      execution_mode: action.execution_mode,
      required_capabilities: requiredCapabilities,
      missing_capabilities: [],
      effective_capabilities: context.capabilities,
      direct_execute_max_risk: context.direct_execute_max_risk,
      project_scope: context.project_allowlist,
      reason: `当前账号最高只允许直接执行 ${context.direct_execute_max_risk} 风险动作，不能直接执行 ${risk}。`
    };
  }

  return {
    status: "ALLOW",
    execution_mode: action.execution_mode,
    required_capabilities: requiredCapabilities,
    missing_capabilities: [],
    effective_capabilities: context.capabilities,
    direct_execute_max_risk: context.direct_execute_max_risk,
    project_scope: context.project_allowlist,
    reason: `账号 ${context.user.username} 已通过 Access Center 校验。`
  };
}

export async function loginToAccessCenter(username, password, metadata = {}) {
  const bundle = await loadAccessCenter();
  const auth = await authenticateLocalUser(bundle, username, password);
  if (auth.status !== "ALLOW") {
    return {
      status: "DENY",
      reason: auth.reason,
      auth_mode: bundle.policy.auth_mode
    };
  }
  const created = await createLocalSession(bundle, auth.context, metadata);
  return {
    status: "ALLOW",
    reason: auth.reason,
    auth_mode: bundle.policy.auth_mode,
    token: created.token,
    session: created.session,
    user: auth.context.user,
    plan: auth.context.plan ? {
      plan_id: auth.context.plan.plan_id,
      display_name: auth.context.plan.display_name,
      tier: auth.context.plan.tier
    } : null,
    roles: auth.context.roles.map((role) => role.role_id)
  };
}

export async function logoutFromAccessCenter(token) {
  const bundle = await loadAccessCenter();
  const revoked = await revokeLocalSession(bundle, token);
  return {
    status: revoked ? "PASS" : "EMPTY",
    session_store_path: bundle.session_store_path
  };
}

export { passwordHash };
