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
  plans: resolve(packageRoot, "examples/plan-entitlements.example.json"),
  invites: resolve(packageRoot, "examples/access-invites.example.json")
};

const runtimePaths = {
  state: resolve(repoRoot, "runtime/global/access-state.json"),
  users: resolve(repoRoot, "runtime/global/access-users.json"),
  memberships: resolve(repoRoot, "runtime/global/access-memberships.json"),
  invites: resolve(repoRoot, "runtime/global/access-invites.json")
};

const riskOrder = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const directExecuteActionIds = new Set(["autopilot-execute", "smart-park-continue", "smart-park-blockers", "agent-real-plan"]);
const agentRuntimeIds = new Set(["auto", "codex-cli", "claude-code", "gemini", "openhands", "aider", "local-agent"]);

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

const consoleRouteCatalog = {
  dashboard: ["console.access"],
  projects: ["project.read"],
  workers: ["worker.read"],
  actions: ["console.access", "autopilot.plan"],
  autopilot: ["autopilot.plan"],
  config: ["access.manage"],
  runtime: ["runtime.read"],
  credentials: ["credential.read"],
  governance: ["governance.read"],
  planning: ["autopilot.plan"],
  memory: ["context.read"],
  pilotStatus: ["console.access"]
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

function slugifySegment(value, fallback = "item") {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

async function persistUsersDocument(document) {
  await writeJson(runtimePaths.users, document);
  return runtimePaths.users;
}

async function persistMembershipsDocument(document) {
  await writeJson(runtimePaths.memberships, document);
  return runtimePaths.memberships;
}

async function persistInvitesDocument(document) {
  await writeJson(runtimePaths.invites, document);
  return runtimePaths.invites;
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

function activeMembershipsForPlan(bundle, planId, workspaceId = null) {
  return (bundle.memberships.memberships ?? []).filter((membership) =>
    membership.plan_id === planId
    && membership.status === "ACTIVE"
    && (!workspaceId || membership.workspace_id === workspaceId)
  );
}

function approvedInvitesForPlan(bundle, planId, workspaceId = null, options = {}) {
  const excludeInviteId = String(options.exclude_invite_id ?? options.excludeInviteId ?? "").trim();
  return (bundle.invites.invites ?? []).filter((invite) =>
    invite.requested_plan_id === planId
    && invite.status === "APPROVED"
    && (!workspaceId || invite.workspace_id === workspaceId)
    && (!excludeInviteId || invite.invite_id !== excludeInviteId)
  );
}

function reservedSeatUsageForPlan(bundle, planId, workspaceId = null, options = {}) {
  const excludeUserId = String(options.exclude_user_id ?? options.excludeUserId ?? "").trim();
  const memberships = activeMembershipsForPlan(bundle, planId, workspaceId)
    .filter((membership) => !excludeUserId || membership.user_id !== excludeUserId);
  const approvedInvites = approvedInvitesForPlan(bundle, planId, workspaceId, options);
  return memberships.length + approvedInvites.length;
}

function findUserRecord(bundle, userOrUsername) {
  const value = String(userOrUsername ?? "").trim();
  if (!value) return null;
  return bundle.indexes.usersById.get(value)
    ?? bundle.indexes.usersByUsername.get(value.toLowerCase())
    ?? null;
}

function membershipDefinition(bundle, userId, workspaceId) {
  return (bundle.memberships.memberships ?? []).find((membership) =>
    membership.user_id === userId
    && membership.workspace_id === workspaceId
    && membership.status === "ACTIVE"
  ) ?? null;
}

function findInviteRecord(bundle, inviteId) {
  const value = String(inviteId ?? "").trim();
  if (!value) return null;
  return (bundle.invites.invites ?? []).find((invite) => invite.invite_id === value) ?? null;
}

function capabilitySetFromProfile(profile) {
  const set = new Set(profile?.capabilities ?? []);
  return set;
}

function hasCapability(profile, capability) {
  const capabilities = capabilitySetFromProfile(profile);
  return capabilities.has("*") || capabilities.has(capability);
}

function requiredRouteCapabilities(routeId) {
  return consoleRouteCatalog[routeId] ?? ["console.access"];
}

function projectAllowed(profile, projectId) {
  if (!projectId) return true;
  const allowlist = profile?.project_allowlist ?? [];
  return allowlist.includes("*") || allowlist.includes(projectId);
}

function defaultProjectAllowlistForRole(roleId) {
  return roleId === "platform_owner" ? ["*"] : ["jinhu-smart-park"];
}

function ensureMembershipDocument(bundle) {
  return {
    schema_version: bundle.memberships.schema_version ?? 1,
    workspace_id: bundle.memberships.workspace_id ?? bundle.state.workspace_id ?? bundle.policy.default_workspace_id,
    memberships: [...(bundle.memberships.memberships ?? [])]
  };
}

function ensureInviteDocument(bundle) {
  return {
    schema_version: bundle.invites.schema_version ?? 1,
    workspace_id: bundle.invites.workspace_id ?? bundle.state.workspace_id ?? bundle.policy.default_workspace_id,
    invites: [...(bundle.invites.invites ?? [])]
  };
}

function ensureUserDocument(bundle) {
  return {
    schema_version: bundle.users.schema_version ?? 1,
    password_algorithm: bundle.users.password_algorithm ?? "scrypt",
    users: [...(bundle.users.users ?? [])]
  };
}

function ensureMembershipRecord(bundle, document, user, workspaceId) {
  const existing = (document.memberships ?? []).find((membership) =>
    membership.user_id === user.user_id && membership.workspace_id === workspaceId
  );
  if (existing) return existing;
  const membership = {
    membership_id: `membership-${slugifySegment(workspaceId, "workspace")}-${slugifySegment(user.user_id, "user")}`,
    workspace_id: workspaceId,
    user_id: user.user_id,
    status: "ACTIVE",
    plan_id: user.default_plan_id,
    role_ids: [user.primary_role_id].filter(Boolean),
    project_allowlist: defaultProjectAllowlistForRole(user.primary_role_id),
    beta_features: [...(user.feature_overrides ?? [])]
  };
  document.memberships.push(membership);
  return membership;
}

function normalizeProjectAllowlist(projects, fallback = ["jinhu-smart-park"]) {
  if (Array.isArray(projects)) {
    const values = unique(projects.map((item) => String(item ?? "").trim()).filter(Boolean));
    return values.includes("*") ? ["*"] : values;
  }
  const raw = String(projects ?? "").trim();
  if (!raw) return [...fallback];
  if (raw === "*") return ["*"];
  return unique(raw.split(",").map((item) => item.trim()).filter(Boolean));
}

function requestedRuntimeId(input = {}) {
  const runtime = String(input.runtime_id ?? input.runtimeId ?? input.agent ?? input.requested_agent ?? "auto").trim() || "auto";
  return agentRuntimeIds.has(runtime) ? runtime : "auto";
}

function requestedParallelCount(input = {}) {
  const explicit = Number(input.parallel_count ?? input.parallelCount ?? input.parallel ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const actionId = String(input.action_id ?? input.actionId ?? "").trim();
  return directExecuteActionIds.has(actionId) ? 4 : 1;
}

function planLimits(plan) {
  return {
    seat_limit: Number.isFinite(Number(plan?.seat_limit)) ? Number(plan.seat_limit) : null,
    project_scope_limit: Number.isFinite(Number(plan?.project_scope_limit)) ? Number(plan.project_scope_limit) : null,
    worker_parallel_limit: Number.isFinite(Number(plan?.worker_parallel_limit)) ? Number(plan.worker_parallel_limit) : null,
    runtime_allowlist: Array.isArray(plan?.runtime_allowlist) ? [...plan.runtime_allowlist] : []
  };
}

function inviteImpactSummary(bundle, plan, workspaceId, projectAllowlist) {
  const usage = workspaceEntitlementUsage(bundle, workspaceId).find((item) => item.plan_id === plan.plan_id) ?? null;
  const nextPlan = nextPlanDefinition(bundle, plan);
  const reservedInviteCount = (bundle.invites.invites ?? []).filter((invite) =>
    invite.workspace_id === workspaceId
    && invite.requested_plan_id === plan.plan_id
    && invite.status === "APPROVED"
  ).length;
  const seatsRemainingBeforeReservations = usage?.seats_remaining ?? null;
  const seatsRemaining = seatsRemainingBeforeReservations == null
    ? null
    : Math.max(seatsRemainingBeforeReservations - reservedInviteCount, 0);
  const requestedProjectScopeCount = projectAllowlist.includes("*") ? null : projectAllowlist.length;
  return {
    plan_id: plan.plan_id,
    plan_name: plan.display_name,
    seat_limit: usage?.seat_limit ?? null,
    seat_usage: usage?.seat_usage ?? 0,
    reserved_invite_count: reservedInviteCount,
    seats_remaining: seatsRemaining,
    fits_seat_limit: seatsRemaining == null ? true : seatsRemaining > 0,
    project_scope_limit: usage?.project_scope_limit ?? null,
    requested_project_scope_count: requestedProjectScopeCount,
    worker_parallel_limit: usage?.worker_parallel_limit ?? null,
    runtime_allowlist: usage?.runtime_allowlist ?? [],
    next_plan: nextPlan
      ? {
          plan_id: nextPlan.plan_id,
          display_name: nextPlan.display_name
        }
      : null
  };
}

function summarizeInvite(bundle, invite) {
  const role = roleDefinition(bundle, invite.requested_role_id);
  const plan = planDefinition(bundle, invite.requested_plan_id);
  const impact = plan
    ? inviteImpactSummary(bundle, plan, invite.workspace_id, normalizeProjectAllowlist(invite.requested_project_allowlist, ["jinhu-smart-park"]))
    : null;
  const nextAction = invite.status === "PENDING_APPROVAL"
    ? "review_invite"
    : invite.status === "APPROVED"
      ? "materialize_invite"
      : invite.status === "MATERIALIZED"
        ? "completed"
      : "none";
  return {
    invite_id: invite.invite_id,
    workspace_id: invite.workspace_id,
    username: invite.username,
    display_name: invite.display_name,
    requested_role_id: invite.requested_role_id,
    requested_role_name: role?.display_name ?? invite.requested_role_id,
    requested_plan_id: invite.requested_plan_id,
    requested_plan_name: plan?.display_name ?? invite.requested_plan_id,
    requested_project_allowlist: invite.requested_project_allowlist ?? [],
    status: invite.status,
    approval_required: invite.approval_required !== false,
    requested_by_user_id: invite.requested_by_user_id,
    requested_by_name: invite.requested_by_name,
    request_comment: invite.request_comment ?? "",
    review_comment: invite.review_comment ?? "",
    reviewed_by_user_id: invite.reviewed_by_user_id ?? "",
    reviewed_by_name: invite.reviewed_by_name ?? "",
    created_at: invite.created_at,
    reviewed_at: invite.reviewed_at ?? "",
    materialized_at: invite.materialized_at ?? "",
    materialized_by_user_id: invite.materialized_by_user_id ?? "",
    materialized_by_name: invite.materialized_by_name ?? "",
    materialized_user_id: invite.materialized_user_id ?? "",
    materialized_membership_id: invite.materialized_membership_id ?? "",
    impact,
    next_action: nextAction
  };
}

function planAllowsRuntime(plan, runtimeId) {
  const allowlist = Array.isArray(plan?.runtime_allowlist) ? plan.runtime_allowlist : [];
  return allowlist.includes("*") || allowlist.includes(runtimeId);
}

function planTierRank(plan) {
  const tier = String(plan?.tier ?? "").toLowerCase();
  if (tier === "internal") return 0;
  if (tier === "starter") return 1;
  if (tier === "team") return 2;
  if (tier === "enterprise") return 3;
  return 999;
}

function nextPlanDefinition(bundle, currentPlan) {
  if (!currentPlan) return null;
  const ordered = [...(bundle.plans.plans ?? [])].sort((left, right) => planTierRank(left) - planTierRank(right));
  const currentIndex = ordered.findIndex((plan) => plan.plan_id === currentPlan.plan_id);
  if (currentIndex < 0) return null;
  return ordered[currentIndex + 1] ?? null;
}

function enforceProjectScopeLimit(plan, projectAllowlist) {
  const normalized = normalizeProjectAllowlist(projectAllowlist);
  const limit = Number(plan?.project_scope_limit ?? 0);
  if (!Number.isFinite(limit) || limit <= 0 || normalized.includes("*")) return normalized;
  if (normalized.length > limit) {
    throw new Error(`Plan ${plan.plan_id} allows at most ${limit} project scopes, received ${normalized.length}.`);
  }
  return normalized;
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
  const [policy, plans, state, users, memberships, invites] = await Promise.all([
    readJson(examplePaths.policy, {}),
    readJson(examplePaths.plans, {}),
    readJson(runtimePaths.state, {}),
    readJson(existsSync(runtimePaths.users) ? runtimePaths.users : examplePaths.users, {}),
    readJson(existsSync(runtimePaths.memberships) ? runtimePaths.memberships : examplePaths.memberships, {}),
    readJson(existsSync(runtimePaths.invites) ? runtimePaths.invites : examplePaths.invites, {})
  ]);

  const bundle = {
    policy,
    plans,
    state,
    users,
    memberships,
    invites,
    paths: {
      ...examplePaths,
      state: runtimePaths.state,
      users: existsSync(runtimePaths.users) ? runtimePaths.users : examplePaths.users,
      memberships: existsSync(runtimePaths.memberships) ? runtimePaths.memberships : examplePaths.memberships,
      invites: existsSync(runtimePaths.invites) ? runtimePaths.invites : examplePaths.invites
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
    seat_limit: plan.seat_limit,
    seat_usage: activeMembershipsForPlan(bundle, plan.plan_id, bundle.state.workspace_id ?? bundle.policy.default_workspace_id).length,
    project_scope_limit: plan.project_scope_limit ?? null,
    worker_parallel_limit: plan.worker_parallel_limit ?? null,
    runtime_allowlist: Array.isArray(plan.runtime_allowlist) ? plan.runtime_allowlist : []
  }));
}

export function accessSummary(bundle, context = null) {
  const current = context?.user ? context : defaultAnonymousContext(bundle);
  const entitlement = current.user ? currentPlanEntitlement(bundle, current) : null;
  const inviteSummary = accessInviteSummary(bundle, bundle.state.workspace_id ?? bundle.policy.default_workspace_id);
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
    invite_count: inviteSummary.invite_count,
    pending_invite_count: inviteSummary.pending_invite_count,
    approved_invite_count: inviteSummary.approved_invite_count,
    materialized_invite_count: inviteSummary.materialized_invite_count,
    authenticated: current.authenticated,
    current_user: current.user,
    current_plan: current.plan ? {
      plan_id: current.plan.plan_id,
      display_name: current.plan.display_name,
      tier: current.plan.tier
    } : null,
    current_roles: current.roles.map((role) => role.role_id),
    direct_execute_max_risk: current.direct_execute_max_risk,
    current_plan_limits: current.plan ? planLimits(current.plan) : null,
    current_entitlement: entitlement,
    invite_summary: inviteSummary
  };
}

export function resolveUserProfile(bundle, userOrUsername) {
  const value = String(userOrUsername ?? "").trim();
  if (!value) return defaultAnonymousContext(bundle);
  const user = findUserRecord(bundle, value);
  return buildProfile(bundle, user);
}

export function findStudioUser(bundle, userOrUsername) {
  return sanitizeUser(findUserRecord(bundle, userOrUsername));
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
  const entitlement = context.user ? currentPlanEntitlement(bundle, context) : null;
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
      tier: context.plan.tier,
      limits: planLimits(context.plan)
    } : null,
    capabilities: context.capabilities,
    direct_execute_max_risk: context.direct_execute_max_risk,
    feature_flags: context.feature_flags,
    project_allowlist: context.project_allowlist,
    can_manage_access: context.can_manage_access,
    entitlement,
    workspace_id: context.workspace_id,
    session: context.session ?? null
  };
}

export function evaluateConsoleRouteAccess(routeId, userContext = null) {
  const requiredCapabilities = requiredRouteCapabilities(routeId);
  const missingCapabilities = requiredCapabilities.filter((capability) => !hasCapability(userContext, capability));
  return {
    route_id: routeId,
    allowed: missingCapabilities.length === 0,
    required_capabilities: requiredCapabilities,
    missing_capabilities: missingCapabilities
  };
}

export function visibleConsoleRouteIds(userContext = null) {
  return Object.keys(consoleRouteCatalog).filter((routeId) => evaluateConsoleRouteAccess(routeId, userContext).allowed);
}

function actionCapabilities(actionId) {
  return consoleActionCatalog[actionId]?.capabilities ?? ["console.access"];
}

export async function evaluateConsoleActionAccess(bundle, input = {}, options = {}) {
  const actionId = String(input.action_id ?? input.actionId ?? "").trim();
  const projectId = String(input.project_id ?? input.projectId ?? "").trim();
  const risk = riskOrder.includes(input.risk) ? input.risk : "LOW";
  const attachmentCount = Number(input.attachment_count ?? input.attachmentCount ?? 0);
  const runtimeId = requestedRuntimeId(input);
  const parallelCount = requestedParallelCount({ ...input, action_id: actionId });
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
      plan_limits: null,
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
      plan_limits: context.plan ? planLimits(context.plan) : null,
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
      plan_limits: context.plan ? planLimits(context.plan) : null,
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
      plan_limits: context.plan ? planLimits(context.plan) : null,
      reason: `缺少能力：${missingCapabilities.join(", ")}`
    };
  }

  if (context.plan && !planAllowsRuntime(context.plan, runtimeId)) {
    return {
      status: "DENY",
      execution_mode: action.execution_mode,
      required_capabilities: requiredCapabilities,
      missing_capabilities: [],
      effective_capabilities: context.capabilities,
      direct_execute_max_risk: context.direct_execute_max_risk,
      project_scope: context.project_allowlist,
      plan_limits: planLimits(context.plan),
      reason: `当前套餐 ${context.plan.display_name} 不允许使用 runtime ${runtimeId}。`
    };
  }

  const workerParallelLimit = Number(context.plan?.worker_parallel_limit ?? 0);
  if (action.execution_mode === "direct_execute" && Number.isFinite(workerParallelLimit) && workerParallelLimit > 0 && parallelCount > workerParallelLimit) {
    return {
      status: "DENY",
      execution_mode: action.execution_mode,
      required_capabilities: requiredCapabilities,
      missing_capabilities: [],
      effective_capabilities: context.capabilities,
      direct_execute_max_risk: context.direct_execute_max_risk,
      project_scope: context.project_allowlist,
      plan_limits: planLimits(context.plan),
      reason: `当前套餐 ${context.plan.display_name} 最多允许 ${workerParallelLimit} 并发，本次请求为 ${parallelCount}。`
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
      plan_limits: context.plan ? planLimits(context.plan) : null,
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
    plan_limits: context.plan ? planLimits(context.plan) : null,
    reason: `账号 ${context.user.username} 已通过 Access Center 校验。`
  };
}

export async function updateStudioUserStatus(bundle, userOrUsername, status) {
  if (!["ACTIVE", "INVITED", "DISABLED"].includes(status)) {
    throw new Error(`Unsupported studio user status: ${status}`);
  }
  const user = findUserRecord(bundle, userOrUsername);
  if (!user) throw new Error(`Studio user not found: ${userOrUsername}`);
  const document = ensureUserDocument(bundle);
  const index = document.users.findIndex((item) => item.user_id === user.user_id);
  const nextUser = {
    ...document.users[index],
    status
  };
  document.users[index] = nextUser;
  const writtenPath = await persistUsersDocument(document);
  return {
    user: sanitizeUser(nextUser),
    written_path: writtenPath
  };
}

export async function resetStudioUserPassword(bundle, userOrUsername, nextPassword) {
  if (String(nextPassword ?? "").trim().length < 8) {
    throw new Error("Password must contain at least 8 characters.");
  }
  const user = findUserRecord(bundle, userOrUsername);
  if (!user) throw new Error(`Studio user not found: ${userOrUsername}`);
  const document = ensureUserDocument(bundle);
  const index = document.users.findIndex((item) => item.user_id === user.user_id);
  const salt = `anksen-${slugifySegment(user.username, "user")}-${Date.now().toString(36)}`;
  const nextUser = {
    ...document.users[index],
    password_hash: passwordHash(String(nextPassword), salt)
  };
  document.users[index] = nextUser;
  const writtenPath = await persistUsersDocument(document);
  return {
    user: sanitizeUser(nextUser),
    written_path: writtenPath
  };
}

export async function assignWorkspacePlan(bundle, userOrUsername, planId, options = {}) {
  const user = findUserRecord(bundle, userOrUsername);
  if (!user) throw new Error(`Studio user not found: ${userOrUsername}`);
  const plan = planDefinition(bundle, planId);
  if (!plan) throw new Error(`Plan not found: ${planId}`);
  const workspaceId = options.workspace_id ?? bundle.state.workspace_id ?? bundle.policy.default_workspace_id;

  const usersDocument = ensureUserDocument(bundle);
  const userIndex = usersDocument.users.findIndex((item) => item.user_id === user.user_id);
  usersDocument.users[userIndex] = {
    ...usersDocument.users[userIndex],
    default_plan_id: plan.plan_id
  };

  const membershipsDocument = ensureMembershipDocument(bundle);
  const membership = ensureMembershipRecord(bundle, membershipsDocument, usersDocument.users[userIndex], workspaceId);
  const seatUsage = reservedSeatUsageForPlan(bundle, plan.plan_id, workspaceId, { exclude_user_id: user.user_id });
  if (Number.isFinite(Number(plan.seat_limit)) && seatUsage >= Number(plan.seat_limit)) {
    throw new Error(`Plan ${plan.plan_id} has reached seat limit ${plan.seat_limit} in workspace ${workspaceId}.`);
  }
  membership.plan_id = plan.plan_id;
  membership.status = membership.status === "SUSPENDED" ? "ACTIVE" : membership.status;
  membership.project_allowlist = enforceProjectScopeLimit(plan, membership.project_allowlist ?? defaultProjectAllowlistForRole(usersDocument.users[userIndex].primary_role_id));

  const usersPath = await persistUsersDocument(usersDocument);
  const membershipsPath = await persistMembershipsDocument(membershipsDocument);
  return {
    user: sanitizeUser(usersDocument.users[userIndex]),
    membership,
    written_paths: [usersPath, membershipsPath]
  };
}

export async function assignWorkspaceRole(bundle, userOrUsername, roleId, options = {}) {
  const user = findUserRecord(bundle, userOrUsername);
  if (!user) throw new Error(`Studio user not found: ${userOrUsername}`);
  const role = roleDefinition(bundle, roleId);
  if (!role) throw new Error(`Role not found: ${roleId}`);
  const workspaceId = options.workspace_id ?? bundle.state.workspace_id ?? bundle.policy.default_workspace_id;
  const membershipsDocument = ensureMembershipDocument(bundle);
  const membership = ensureMembershipRecord(bundle, membershipsDocument, user, workspaceId);
  membership.role_ids = unique([...(membership.role_ids ?? []), role.role_id]);
  if (!Array.isArray(membership.project_allowlist) || membership.project_allowlist.length === 0) {
    membership.project_allowlist = defaultProjectAllowlistForRole(role.role_id);
  }
  membership.status = "ACTIVE";
  const writtenPath = await persistMembershipsDocument(membershipsDocument);
  return {
    user: sanitizeUser(user),
    membership,
    written_path: writtenPath
  };
}

export async function createStudioUser(bundle, input = {}) {
  const username = String(input.username ?? "").trim().toLowerCase();
  const displayName = String(input.display_name ?? input.displayName ?? "").trim();
  const roleId = String(input.role_id ?? input.roleId ?? "").trim();
  const planId = String(input.plan_id ?? input.planId ?? "").trim();
  const password = String(input.password ?? "").trim();
  const workspaceId = String(input.workspace_id ?? input.workspaceId ?? bundle.state.workspace_id ?? bundle.policy.default_workspace_id).trim();
  const projectAllowlist = normalizeProjectAllowlist(input.project_allowlist ?? input.projectAllowlist, defaultProjectAllowlistForRole(roleId));
  const seatReservationInviteId = String(input.seat_reservation_invite_id ?? input.seatReservationInviteId ?? "").trim();

  if (!username) throw new Error("Username is required.");
  if (!displayName) throw new Error("Display name is required.");
  if (!roleId) throw new Error("Role is required.");
  if (!planId) throw new Error("Plan is required.");
  if (password.length < 8) throw new Error("Password must contain at least 8 characters.");
  if (findUserRecord(bundle, username)) throw new Error(`Studio user already exists: ${username}`);

  const role = roleDefinition(bundle, roleId);
  if (!role) throw new Error(`Role not found: ${roleId}`);
  const plan = planDefinition(bundle, planId);
  if (!plan) throw new Error(`Plan not found: ${planId}`);
  const seatUsage = reservedSeatUsageForPlan(bundle, plan.plan_id, workspaceId, { exclude_invite_id: seatReservationInviteId });
  if (Number.isFinite(Number(plan.seat_limit)) && seatUsage >= Number(plan.seat_limit)) {
    throw new Error(`Plan ${plan.plan_id} has reached seat limit ${plan.seat_limit} in workspace ${workspaceId}.`);
  }

  const usersDocument = ensureUserDocument(bundle);
  const userId = `studio-${slugifySegment(username, "user")}`;
  if ((usersDocument.users ?? []).some((item) => item.user_id === userId)) {
    throw new Error(`Generated user_id already exists: ${userId}`);
  }
  const salt = `anksen-${slugifySegment(username, "user")}-${Date.now().toString(36)}`;
  const nextUser = {
    user_id: userId,
    username,
    display_name: displayName,
    status: "ACTIVE",
    primary_role_id: role.role_id,
    role_ids: [role.role_id],
    default_plan_id: plan.plan_id,
    feature_overrides: [],
    password_hash: passwordHash(password, salt)
  };
  usersDocument.users.push(nextUser);

  const membershipsDocument = ensureMembershipDocument(bundle);
  membershipsDocument.memberships.push({
    membership_id: `membership-${slugifySegment(workspaceId, "workspace")}-${slugifySegment(userId, "user")}`,
    workspace_id: workspaceId,
    user_id: userId,
    status: "ACTIVE",
    plan_id: plan.plan_id,
    role_ids: [role.role_id],
    project_allowlist: enforceProjectScopeLimit(plan, projectAllowlist),
    beta_features: []
  });

  const usersPath = await persistUsersDocument(usersDocument);
  const membershipsPath = await persistMembershipsDocument(membershipsDocument);
  return {
    user: sanitizeUser(nextUser),
    membership: membershipsDocument.memberships.at(-1),
    written_paths: [usersPath, membershipsPath]
  };
}

export async function updateWorkspaceProjectScope(bundle, userOrUsername, projects, options = {}) {
  const user = findUserRecord(bundle, userOrUsername);
  if (!user) throw new Error(`Studio user not found: ${userOrUsername}`);
  const workspaceId = options.workspace_id ?? bundle.state.workspace_id ?? bundle.policy.default_workspace_id;
  const membershipsDocument = ensureMembershipDocument(bundle);
  const membership = ensureMembershipRecord(bundle, membershipsDocument, user, workspaceId);
  const plan = planDefinition(bundle, membership.plan_id ?? user.default_plan_id);
  membership.project_allowlist = enforceProjectScopeLimit(plan, normalizeProjectAllowlist(projects, membership.project_allowlist ?? defaultProjectAllowlistForRole(user.primary_role_id)));
  const writtenPath = await persistMembershipsDocument(membershipsDocument);
  return {
    user: sanitizeUser(user),
    membership,
    written_path: writtenPath
  };
}

export async function updateWorkspaceMembershipStatus(bundle, userOrUsername, status, options = {}) {
  if (!["ACTIVE", "PENDING", "SUSPENDED"].includes(status)) {
    throw new Error(`Unsupported workspace membership status: ${status}`);
  }
  const user = findUserRecord(bundle, userOrUsername);
  if (!user) throw new Error(`Studio user not found: ${userOrUsername}`);
  const workspaceId = options.workspace_id ?? bundle.state.workspace_id ?? bundle.policy.default_workspace_id;
  const membershipsDocument = ensureMembershipDocument(bundle);
  const membership = ensureMembershipRecord(bundle, membershipsDocument, user, workspaceId);
  membership.status = status;
  const writtenPath = await persistMembershipsDocument(membershipsDocument);
  return {
    user: sanitizeUser(user),
    membership,
    written_path: writtenPath
  };
}

export function workspaceEntitlementUsage(bundle, workspaceId = null) {
  const effectiveWorkspaceId = workspaceId ?? bundle.state.workspace_id ?? bundle.policy.default_workspace_id;
  return (bundle.plans.plans ?? []).map((plan) => {
    const memberships = activeMembershipsForPlan(bundle, plan.plan_id, effectiveWorkspaceId);
    return {
      plan_id: plan.plan_id,
      display_name: plan.display_name,
      seat_limit: Number.isFinite(Number(plan.seat_limit)) ? Number(plan.seat_limit) : null,
      seat_usage: memberships.length,
      seats_remaining: Number.isFinite(Number(plan.seat_limit)) ? Math.max(Number(plan.seat_limit) - memberships.length, 0) : null,
      project_scope_limit: Number.isFinite(Number(plan.project_scope_limit)) ? Number(plan.project_scope_limit) : null,
      worker_parallel_limit: Number.isFinite(Number(plan.worker_parallel_limit)) ? Number(plan.worker_parallel_limit) : null,
      runtime_allowlist: Array.isArray(plan.runtime_allowlist) ? plan.runtime_allowlist : []
    };
  });
}

export function listAccessInvites(bundle, options = {}) {
  const workspaceId = options.workspace_id ?? bundle.state.workspace_id ?? bundle.policy.default_workspace_id;
  const includeTerminal = options.include_terminal === true;
  const terminalStatuses = new Set(["MATERIALIZED", "REJECTED", "CANCELLED"]);
  return (bundle.invites.invites ?? [])
    .filter((invite) => invite.workspace_id === workspaceId)
    .filter((invite) => includeTerminal || !terminalStatuses.has(invite.status))
    .map((invite) => summarizeInvite(bundle, invite))
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
}

export function accessInviteSummary(bundle, workspaceId = null) {
  const workspaceInvites = (bundle.invites.invites ?? []).filter((invite) =>
    invite.workspace_id === (workspaceId ?? bundle.state.workspace_id ?? bundle.policy.default_workspace_id)
  );
  const byStatus = Object.fromEntries(["PENDING_APPROVAL", "APPROVED", "MATERIALIZED", "REJECTED", "CANCELLED"].map((status) => [
    status,
    workspaceInvites.filter((invite) => invite.status === status).length
  ]));
  return {
    invite_count: workspaceInvites.length,
    pending_invite_count: byStatus.PENDING_APPROVAL ?? 0,
    approved_invite_count: byStatus.APPROVED ?? 0,
    materialized_invite_count: byStatus.MATERIALIZED ?? 0,
    rejected_invite_count: byStatus.REJECTED ?? 0,
    cancelled_invite_count: byStatus.CANCELLED ?? 0,
    by_status: byStatus,
    invites: workspaceInvites.map((invite) => summarizeInvite(bundle, invite))
  };
}

export function currentPlanEntitlement(bundle, context = null) {
  if (!context?.user || !context?.plan) return null;
  const workspaceId = context.workspace_id ?? bundle.state.workspace_id ?? bundle.policy.default_workspace_id;
  const usage = workspaceEntitlementUsage(bundle, workspaceId).find((item) => item.plan_id === context.plan.plan_id) ?? null;
  const projectAllowlist = Array.isArray(context.project_allowlist) ? context.project_allowlist : [];
  const projectScopeUsage = projectAllowlist.includes("*") ? null : projectAllowlist.length;
  const projectScopeRemaining = usage?.project_scope_limit == null || usage.project_scope_limit <= 0 || projectScopeUsage == null
    ? null
    : Math.max(usage.project_scope_limit - projectScopeUsage, 0);
  const nextPlan = nextPlanDefinition(bundle, context.plan);
  const alerts = [];

  if (usage?.seat_limit != null) {
    if (usage.seats_remaining === 0) {
      alerts.push({
        level: "warning",
        code: "seat_full",
        title: "当前套餐席位已满",
        detail: `套餐 ${context.plan.display_name} 已用 ${usage.seat_usage}/${usage.seat_limit} 席位。`,
        action: nextPlan ? `建议升级到 ${nextPlan.display_name}` : "建议释放或扩容席位"
      });
    } else if (usage.seats_remaining <= 2) {
      alerts.push({
        level: "notice",
        code: "seat_low",
        title: "席位余量较少",
        detail: `套餐 ${context.plan.display_name} 还剩 ${usage.seats_remaining} 个席位。`,
        action: nextPlan ? `新增成员前可评估升级到 ${nextPlan.display_name}` : "新增成员前请先检查席位"
      });
    }
  }

  if (usage?.project_scope_limit != null && usage.project_scope_limit > 0 && projectScopeUsage != null) {
    if (projectScopeRemaining === 0) {
      alerts.push({
        level: "warning",
        code: "project_scope_full",
        title: "项目范围已达上限",
        detail: `当前账号已绑定 ${projectScopeUsage}/${usage.project_scope_limit} 个项目。`,
        action: nextPlan ? `如需增加项目，请升级到 ${nextPlan.display_name}` : "请联系管理员调整项目范围"
      });
    } else if (projectScopeRemaining === 1) {
      alerts.push({
        level: "notice",
        code: "project_scope_low",
        title: "项目范围即将用尽",
        detail: `当前账号还可再绑定 ${projectScopeRemaining} 个项目。`,
        action: "新增项目前请先核对当前 project scope"
      });
    }
  }

  if (usage?.worker_parallel_limit != null && usage.worker_parallel_limit <= 1) {
    alerts.push({
      level: "info",
      code: "parallel_limited",
      title: "并发执行受限",
      detail: `当前套餐最多允许 ${usage.worker_parallel_limit} 并发任务。`,
      action: nextPlan ? `需要批处理能力时可升级到 ${nextPlan.display_name}` : "需要更高并发时请联系管理员"
    });
  }

  if (Array.isArray(usage?.runtime_allowlist) && !usage.runtime_allowlist.includes("*") && usage.runtime_allowlist.length > 0) {
    alerts.push({
      level: "info",
      code: "runtime_allowlist",
      title: "Runtime 有限额",
      detail: `当前可用 runtime：${usage.runtime_allowlist.join(", ")}。`,
      action: "如需更多 Agent/Runtime，请调整套餐或角色"
    });
  }

  return {
    plan_id: context.plan.plan_id,
    plan_name: context.plan.display_name,
    tier: context.plan.tier,
    seat_limit: usage?.seat_limit ?? null,
    seat_usage: usage?.seat_usage ?? null,
    seats_remaining: usage?.seats_remaining ?? null,
    project_scope_limit: usage?.project_scope_limit ?? null,
    project_scope_usage: projectScopeUsage,
    project_scope_remaining: projectScopeRemaining,
    worker_parallel_limit: usage?.worker_parallel_limit ?? null,
    runtime_allowlist: usage?.runtime_allowlist ?? [],
    next_plan: nextPlan ? {
      plan_id: nextPlan.plan_id,
      display_name: nextPlan.display_name,
      tier: nextPlan.tier
    } : null,
    alerts
  };
}

export async function createAccessInvite(bundle, input = {}) {
  const username = String(input.username ?? "").trim().toLowerCase();
  const displayName = String(input.display_name ?? input.displayName ?? "").trim();
  const roleId = String(input.role_id ?? input.roleId ?? "").trim();
  const planId = String(input.plan_id ?? input.planId ?? "").trim();
  const workspaceId = String(input.workspace_id ?? input.workspaceId ?? bundle.state.workspace_id ?? bundle.policy.default_workspace_id).trim();
  const requestComment = String(input.request_comment ?? input.requestComment ?? "").trim();
  const requestedByUserId = String(input.requested_by_user_id ?? input.requestedByUserId ?? bundle.policy.default_console_user_id).trim();
  const requestedByName = String(input.requested_by_name ?? input.requestedByName ?? resolveUserProfile(bundle, requestedByUserId).user?.display_name ?? requestedByUserId).trim();
  const projectAllowlist = normalizeProjectAllowlist(input.project_allowlist ?? input.projectAllowlist, defaultProjectAllowlistForRole(roleId));

  if (!username) throw new Error("Username is required.");
  if (!displayName) throw new Error("Display name is required.");
  if (!roleId) throw new Error("Role is required.");
  if (!planId) throw new Error("Plan is required.");
  if (findUserRecord(bundle, username)) throw new Error(`Studio user already exists: ${username}`);
  if (!requestedByUserId || !requestedByName) throw new Error("Requested by identity is required.");

  const role = roleDefinition(bundle, roleId);
  if (!role) throw new Error(`Role not found: ${roleId}`);
  const plan = planDefinition(bundle, planId);
  if (!plan) throw new Error(`Plan not found: ${planId}`);
  const normalizedProjects = enforceProjectScopeLimit(plan, projectAllowlist);

  const existingInvite = (bundle.invites.invites ?? []).find((invite) =>
    String(invite.username).toLowerCase() === username
    && invite.workspace_id === workspaceId
    && ["PENDING_APPROVAL", "APPROVED"].includes(invite.status)
  );
  if (existingInvite) {
    throw new Error(`Active invite already exists for ${username}: ${existingInvite.invite_id}`);
  }

  const createdAt = new Date().toISOString();
  const invite = {
    invite_id: `invite-${slugifySegment(username, "user")}-${createdAt.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36)}`,
    workspace_id: workspaceId,
    username,
    display_name: displayName,
    requested_role_id: role.role_id,
    requested_plan_id: plan.plan_id,
    requested_project_allowlist: normalizedProjects,
    status: "PENDING_APPROVAL",
    approval_required: true,
    requested_by_user_id: requestedByUserId,
    requested_by_name: requestedByName,
    request_comment: requestComment,
    created_at: createdAt
  };
  const document = ensureInviteDocument(bundle);
  document.invites.push(invite);
  const writtenPath = await persistInvitesDocument(document);
  return {
    invite: summarizeInvite({
      ...bundle,
      invites: document
    }, invite),
    written_path: writtenPath
  };
}

export async function reviewAccessInvite(bundle, inviteId, decision, options = {}) {
  const normalizedDecision = String(decision ?? "").trim().toUpperCase();
  if (!["APPROVED", "REJECTED", "CANCELLED"].includes(normalizedDecision)) {
    throw new Error(`Unsupported invite decision: ${decision}`);
  }
  const invite = findInviteRecord(bundle, inviteId);
  if (!invite) throw new Error(`Access invite not found: ${inviteId}`);
  if (invite.status !== "PENDING_APPROVAL") {
    throw new Error(`Access invite ${inviteId} is already ${invite.status}.`);
  }
  if (findUserRecord(bundle, invite.username)) {
    throw new Error(`Studio user already exists for invite username: ${invite.username}`);
  }

  const reviewedByUserId = String(options.reviewed_by_user_id ?? options.reviewedByUserId ?? bundle.policy.default_console_user_id).trim();
  const reviewedByName = String(options.reviewed_by_name ?? options.reviewedByName ?? resolveUserProfile(bundle, reviewedByUserId).user?.display_name ?? reviewedByUserId).trim();
  const reviewComment = String(options.review_comment ?? options.reviewComment ?? "").trim();
  const document = ensureInviteDocument(bundle);
  const inviteIndex = document.invites.findIndex((item) => item.invite_id === invite.invite_id);
  const plan = planDefinition(bundle, invite.requested_plan_id);
  if (!plan) throw new Error(`Plan not found for invite ${invite.invite_id}: ${invite.requested_plan_id}`);
  if (normalizedDecision === "APPROVED") {
    const impact = inviteImpactSummary(bundle, plan, invite.workspace_id, normalizeProjectAllowlist(invite.requested_project_allowlist, ["jinhu-smart-park"]));
    if (!impact.fits_seat_limit) {
      throw new Error(`Plan ${plan.plan_id} has no remaining seat for invite ${invite.invite_id}.`);
    }
  }
  const nextInvite = {
    ...document.invites[inviteIndex],
    status: normalizedDecision,
    review_comment: reviewComment,
    reviewed_by_user_id: reviewedByUserId,
    reviewed_by_name: reviewedByName,
    reviewed_at: new Date().toISOString()
  };
  document.invites[inviteIndex] = nextInvite;
  const writtenPath = await persistInvitesDocument(document);
  return {
    invite: summarizeInvite({
      ...bundle,
      invites: document
    }, nextInvite),
    written_path: writtenPath
  };
}

export async function materializeAccessInvite(bundle, inviteId, password, options = {}) {
  const normalizedInviteId = String(inviteId ?? "").trim();
  const normalizedPassword = String(password ?? "").trim();
  if (!normalizedInviteId) throw new Error("Invite id is required.");
  if (normalizedPassword.length < 8) throw new Error("Password must contain at least 8 characters.");

  const invite = findInviteRecord(bundle, normalizedInviteId);
  if (!invite) throw new Error(`Access invite not found: ${inviteId}`);
  if (invite.status !== "APPROVED") {
    throw new Error(`Access invite ${inviteId} must be APPROVED before materialization, current status is ${invite.status}.`);
  }
  if (findUserRecord(bundle, invite.username)) {
    throw new Error(`Studio user already exists for invite username: ${invite.username}`);
  }

  const role = roleDefinition(bundle, invite.requested_role_id);
  if (!role) throw new Error(`Role not found for invite ${invite.invite_id}: ${invite.requested_role_id}`);
  const plan = planDefinition(bundle, invite.requested_plan_id);
  if (!plan) throw new Error(`Plan not found for invite ${invite.invite_id}: ${invite.requested_plan_id}`);

  const created = await createStudioUser(bundle, {
    username: invite.username,
    display_name: invite.display_name,
    role_id: role.role_id,
    plan_id: plan.plan_id,
    password: normalizedPassword,
    workspace_id: invite.workspace_id,
    project_allowlist: normalizeProjectAllowlist(invite.requested_project_allowlist, defaultProjectAllowlistForRole(role.role_id)),
    seat_reservation_invite_id: invite.invite_id
  });

  const materializedByUserId = String(options.materialized_by_user_id ?? options.materializedByUserId ?? bundle.policy.default_console_user_id).trim();
  const materializedByName = String(options.materialized_by_name ?? options.materializedByName ?? resolveUserProfile(bundle, materializedByUserId).user?.display_name ?? materializedByUserId).trim();
  const refreshedBundle = await loadAccessCenter();
  const document = ensureInviteDocument(refreshedBundle);
  const inviteIndex = document.invites.findIndex((item) => item.invite_id === normalizedInviteId);
  if (inviteIndex < 0) {
    throw new Error(`Access invite disappeared before materialization could complete: ${normalizedInviteId}`);
  }

  const nextInvite = {
    ...document.invites[inviteIndex],
    status: "MATERIALIZED",
    materialized_at: new Date().toISOString(),
    materialized_by_user_id: materializedByUserId,
    materialized_by_name: materializedByName,
    materialized_user_id: created.user.user_id,
    materialized_membership_id: created.membership.membership_id
  };
  document.invites[inviteIndex] = nextInvite;
  const invitePath = await persistInvitesDocument(document);
  const finalBundle = await loadAccessCenter();

  return {
    invite: summarizeInvite(finalBundle, nextInvite),
    user: created.user,
    membership: created.membership,
    written_paths: [...created.written_paths, invitePath]
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
