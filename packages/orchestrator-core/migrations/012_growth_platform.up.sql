CREATE TABLE IF NOT EXISTS growth_lead (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  tenant_id text NOT NULL,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'NEW',
  person jsonb NOT NULL DEFAULT '{}'::jsonb,
  company jsonb NOT NULL DEFAULT '{}'::jsonb,
  market_id text,
  icp_id text,
  external_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  score jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_lead_scope_idx ON growth_lead(organization_id,workspace_id,tenant_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS growth_identity (
  id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  tenant_id text NOT NULL,
  lead_id text NOT NULL REFERENCES growth_lead(id) ON DELETE CASCADE,
  identity_type text NOT NULL,
  normalized_value text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,workspace_id,tenant_id,identity_type,normalized_value)
);
CREATE INDEX IF NOT EXISTS growth_identity_lead_idx ON growth_identity(organization_id,workspace_id,tenant_id,lead_id);

CREATE TABLE IF NOT EXISTS growth_engagement (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  tenant_id text NOT NULL,
  lead_id text NOT NULL REFERENCES growth_lead(id) ON DELETE CASCADE,
  kind text NOT NULL,
  channel text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_engagement_lead_idx ON growth_engagement(organization_id,workspace_id,tenant_id,lead_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS growth_opportunity (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  tenant_id text NOT NULL,
  lead_id text NOT NULL REFERENCES growth_lead(id),
  stage text NOT NULL,
  score numeric,
  downstream_ref jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_opportunity_scope_idx ON growth_opportunity(organization_id,workspace_id,tenant_id,lead_id);

CREATE TABLE IF NOT EXISTS growth_revenue_attribution (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  tenant_id text NOT NULL,
  opportunity_id text NOT NULL REFERENCES growth_opportunity(id),
  lead_id text NOT NULL REFERENCES growth_lead(id),
  amount numeric NOT NULL,
  currency text NOT NULL,
  attributed_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS growth_revenue_scope_idx ON growth_revenue_attribution(organization_id,workspace_id,tenant_id,attributed_at DESC);

CREATE TABLE IF NOT EXISTS growth_event (
  event_id text PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  tenant_id text NOT NULL,
  event_type text NOT NULL,
  subject_type text,
  subject_id text NOT NULL,
  source text NOT NULL,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version integer NOT NULL DEFAULT 1,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,workspace_id,tenant_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS growth_event_scope_idx ON growth_event(organization_id,workspace_id,tenant_id,occurred_at DESC);
