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
  last_actor_id text NOT NULL DEFAULT 'SYSTEM',
  UNIQUE(organization_id,workspace_id,tenant_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS growth_identity_review_open_idx ON growth_identity_review_case(organization_id,workspace_id,tenant_id,status,created_at DESC);
ALTER TABLE growth_identity_review_case ADD COLUMN IF NOT EXISTS last_actor_id text NOT NULL DEFAULT 'SYSTEM';

CREATE TABLE IF NOT EXISTS growth_identity_review_event (
  sequence_id bigserial PRIMARY KEY,
  case_id text NOT NULL REFERENCES growth_identity_review_case(id) ON DELETE CASCADE,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  tenant_id text NOT NULL,
  event_type text NOT NULL,
  previous_status text,
  next_status text NOT NULL,
  case_version integer NOT NULL,
  actor_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_identity_review_event_case_idx ON growth_identity_review_event(organization_id,workspace_id,tenant_id,case_id,sequence_id);

CREATE OR REPLACE FUNCTION audit_growth_identity_review_case() RETURNS trigger AS $$
DECLARE event_name text;
BEGIN
  IF TG_OP='INSERT' THEN event_name := 'IDENTITY_REVIEW_OPENED';
  ELSIF NEW.status='RESOLVED' AND OLD.status='OPEN' THEN event_name := 'IDENTITY_REVIEW_RESOLVED';
  ELSIF NEW.status='DISMISSED' AND OLD.status='OPEN' THEN event_name := 'IDENTITY_REVIEW_DISMISSED';
  ELSE RETURN NEW;
  END IF;
  INSERT INTO growth_identity_review_event(case_id,organization_id,workspace_id,tenant_id,event_type,previous_status,next_status,case_version,actor_id,payload,created_at)
  VALUES(NEW.id,NEW.organization_id,NEW.workspace_id,NEW.tenant_id,event_name,CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.status END,NEW.status,NEW.version,NEW.last_actor_id,jsonb_build_object('candidateCount',jsonb_array_length(NEW.candidate_lead_ids),'identityTypes',NEW.identity_types,'resolutionLeadId',NEW.resolution_lead_id),NEW.updated_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS growth_identity_review_case_audit ON growth_identity_review_case;
CREATE TRIGGER growth_identity_review_case_audit AFTER INSERT OR UPDATE ON growth_identity_review_case FOR EACH ROW EXECUTE FUNCTION audit_growth_identity_review_case();
