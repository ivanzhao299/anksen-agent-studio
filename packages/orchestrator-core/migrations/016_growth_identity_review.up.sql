CREATE TABLE IF NOT EXISTS growth_identity_review_case (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  tenant_id text NOT NULL,
  idempotency_key text NOT NULL,
  source text NOT NULL,
  external_id_hash text NOT NULL,
  candidate_lead_ids jsonb NOT NULL,
  identity_types jsonb NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','DISMISSED')),
  resolution_lead_id text,
  resolution_reason text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  UNIQUE(organization_id,workspace_id,tenant_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS growth_identity_review_open_idx ON growth_identity_review_case(organization_id,workspace_id,tenant_id,status,created_at DESC);
