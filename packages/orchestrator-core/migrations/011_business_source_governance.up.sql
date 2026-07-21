BEGIN;
CREATE TABLE IF NOT EXISTS business_data_source_approval(
  id uuid PRIMARY KEY,
  connector_id text NOT NULL REFERENCES business_data_connector(id),
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  data_owner_id text NOT NULL,
  mapping_version text NOT NULL,
  status text NOT NULL CHECK(status IN('PENDING','APPROVED','REJECTED','REVOKED')),
  requested_by text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by text,
  decided_at timestamptz,
  decision_reason text,
  version integer NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_source_pending_approval ON business_data_source_approval(connector_id) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS idx_business_source_approval_scope ON business_data_source_approval(organization_id,workspace_id,connector_id,status);
CREATE TABLE IF NOT EXISTS business_data_sync_checkpoint(
  connector_id text PRIMARY KEY REFERENCES business_data_connector(id),
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  source_cursor text,
  last_observed_at timestamptz,
  last_batch_id uuid REFERENCES business_data_sync_batch(id),
  source_count bigint NOT NULL DEFAULT 0,
  mapped_count bigint NOT NULL DEFAULT 0,
  rejected_count bigint NOT NULL DEFAULT 0,
  reconciliation_status text NOT NULL DEFAULT 'PENDING' CHECK(reconciliation_status IN('PENDING','MATCHED','MISMATCH','FAILED')),
  reconciliation_hash text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
