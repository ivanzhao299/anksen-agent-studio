export type AccessRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type StudioUserStatus = "ACTIVE" | "INVITED" | "DISABLED";
export type WorkspaceMembershipStatus = "ACTIVE" | "PENDING" | "SUSPENDED";
export type AccessInviteStatus = "PENDING_APPROVAL" | "APPROVED" | "MATERIALIZED" | "REJECTED" | "CANCELLED";
export type AccessAuthMode = "local_password_session" | "local_session_only";
export type ConsoleAccessMode = "dry_run_only" | "direct_execute" | "proposal_only" | "human_approval_required";

export interface AccessRoleDefinition {
  readonly role_id: string;
  readonly display_name: string;
  readonly description: string;
  readonly capabilities: readonly string[];
  readonly direct_execute_max_risk: AccessRiskLevel;
  readonly can_manage_access: boolean;
}

export interface StudioUser {
  readonly user_id: string;
  readonly username: string;
  readonly display_name: string;
  readonly status: StudioUserStatus;
  readonly primary_role_id: string;
  readonly role_ids: readonly string[];
  readonly default_plan_id: string;
  readonly feature_overrides: readonly string[];
  readonly password_hash: string;
}

export interface WorkspaceMembership {
  readonly membership_id: string;
  readonly workspace_id: string;
  readonly user_id: string;
  readonly status: WorkspaceMembershipStatus;
  readonly plan_id: string;
  readonly role_ids: readonly string[];
  readonly project_allowlist: readonly string[];
  readonly beta_features: readonly string[];
}

export interface AccessInvite {
  readonly invite_id: string;
  readonly workspace_id: string;
  readonly username: string;
  readonly display_name: string;
  readonly requested_role_id: string;
  readonly requested_plan_id: string;
  readonly requested_project_allowlist: readonly string[];
  readonly status: AccessInviteStatus;
  readonly approval_required: boolean;
  readonly requested_by_user_id: string;
  readonly requested_by_name: string;
  readonly request_comment?: string;
  readonly review_comment?: string;
  readonly reviewed_by_user_id?: string;
  readonly reviewed_by_name?: string;
  readonly created_at: string;
  readonly reviewed_at?: string;
  readonly materialized_at?: string;
  readonly materialized_by_user_id?: string;
  readonly materialized_by_name?: string;
  readonly materialized_user_id?: string;
  readonly materialized_membership_id?: string;
}

export interface PlanEntitlement {
  readonly plan_id: string;
  readonly display_name: string;
  readonly tier: "internal" | "starter" | "team" | "enterprise";
  readonly capabilities: readonly string[];
  readonly beta_features: readonly string[];
  readonly direct_execute_max_risk: AccessRiskLevel;
  readonly seat_limit: number;
  readonly project_scope_limit?: number;
  readonly worker_parallel_limit?: number;
  readonly runtime_allowlist?: readonly string[];
}

export interface AccessPolicy {
  readonly schema_version: 1;
  readonly policy_id: string;
  readonly auth_mode: AccessAuthMode;
  readonly default_workspace_id: string;
  readonly default_console_user_id: string;
  readonly session_ttl_hours: number;
  readonly allow_anonymous_console_read: boolean;
  readonly capability_catalog: readonly string[];
  readonly roles: readonly AccessRoleDefinition[];
}

export interface AccessState {
  readonly schema_version: 1;
  readonly access_center_id: string;
  readonly workspace_id: string;
  readonly login_mode: AccessAuthMode;
  readonly allow_anonymous_console_read: boolean;
  readonly default_console_user_id: string;
  readonly session_ttl_hours: number;
  readonly session_store_path: string;
}

export interface LocalSessionRecord {
  readonly session_id: string;
  readonly session_token: string;
  readonly workspace_id: string;
  readonly user_id: string;
  readonly auth_source: AccessAuthMode;
  readonly created_at: string;
  readonly expires_at: string;
  readonly last_seen_at: string;
  readonly bind_address: "127.0.0.1";
  readonly user_agent: string;
}

export interface ConsoleActionAccessDecision {
  readonly status: "ALLOW" | "DENY";
  readonly execution_mode: ConsoleAccessMode;
  readonly required_capabilities: readonly string[];
  readonly missing_capabilities: readonly string[];
  readonly effective_capabilities: readonly string[];
  readonly direct_execute_max_risk: AccessRiskLevel;
  readonly project_scope: readonly string[];
  readonly plan_limits?: {
    readonly seat_limit: number | null;
    readonly project_scope_limit: number | null;
    readonly worker_parallel_limit: number | null;
    readonly runtime_allowlist: readonly string[];
  };
  readonly reason: string;
}

export const accessCenterVersion = "0.1.0";
