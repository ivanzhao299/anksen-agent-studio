BEGIN;

CREATE TABLE IF NOT EXISTS business_approval(
  id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  application_id text NOT NULL,
  business_record_id uuid NOT NULL REFERENCES business_application_record(id),
  object_version integer NOT NULL,
  from_status text NOT NULL,
  requested_status text NOT NULL,
  status text NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  requested_by text NOT NULL,
  reviewed_by text,
  comment text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE(organization_id, workspace_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_business_approval_record ON business_approval(organization_id, workspace_id, business_record_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_approval_pending_record ON business_approval(organization_id, workspace_id, business_record_id) WHERE status='PENDING';

COMMIT;
