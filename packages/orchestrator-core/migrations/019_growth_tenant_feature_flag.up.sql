CREATE TABLE IF NOT EXISTS growth_tenant_feature_flag (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  tenant_id text NOT NULL,
  flag_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  authorization_reference_id text,
  expires_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  last_actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,workspace_id,tenant_id,flag_key),
  CHECK(NOT enabled OR (authorization_reference_id IS NOT NULL AND expires_at IS NOT NULL)),
  CHECK(authorization_reference_id IS NULL OR authorization_reference_id !~* '(token|password|secret|api[_-]?key)=')
);
CREATE TABLE IF NOT EXISTS growth_tenant_feature_flag_event (
  sequence_id bigserial PRIMARY KEY,
  flag_id text NOT NULL REFERENCES growth_tenant_feature_flag(id) ON DELETE CASCADE,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  tenant_id text NOT NULL,
  flag_key text NOT NULL,
  enabled boolean NOT NULL,
  flag_version integer NOT NULL,
  actor_id text NOT NULL,
  authorization_reference_hash text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_tenant_feature_flag_scope_idx ON growth_tenant_feature_flag(organization_id,workspace_id,tenant_id,flag_key);
CREATE INDEX IF NOT EXISTS growth_tenant_feature_flag_event_scope_idx ON growth_tenant_feature_flag_event(organization_id,workspace_id,tenant_id,flag_key,sequence_id);
