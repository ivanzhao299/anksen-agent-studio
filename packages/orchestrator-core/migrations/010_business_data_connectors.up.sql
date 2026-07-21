BEGIN;
CREATE TABLE IF NOT EXISTS business_data_connector(
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  application_id text NOT NULL,
  source_system text NOT NULL,
  connector_type text NOT NULL CHECK(connector_type IN('FIXTURE','API','SQL_READ_MODEL','WEBHOOK','FILE_IMPORT')),
  credential_reference_id text,
  allowed_object_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  freshness_seconds integer NOT NULL CHECK(freshness_seconds BETWEEN 60 AND 31536000),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','PAUSED','ERROR','REVOKED')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  last_success_at timestamptz,
  last_error_summary text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,workspace_id,application_id,source_system)
);
CREATE TABLE IF NOT EXISTS business_data_sync_batch(
  id uuid PRIMARY KEY,
  connector_id text NOT NULL REFERENCES business_data_connector(id),
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  application_id text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK(status IN('APPLIED','FAILED')),
  observed_at timestamptz NOT NULL,
  source_cursor text,
  evidence_ref_hash text NOT NULL,
  payload_hash text NOT NULL,
  received_count integer NOT NULL DEFAULT 0,
  applied_count integer NOT NULL DEFAULT 0,
  unchanged_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  error_summary text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connector_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS business_data_sync_item(
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES business_data_sync_batch(id) ON DELETE CASCADE,
  source_record_key text NOT NULL,
  object_type text NOT NULL,
  business_record_id uuid REFERENCES business_application_record(id),
  disposition text NOT NULL CHECK(disposition IN('CREATED','UPDATED','UNCHANGED','REJECTED')),
  object_version integer,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(batch_id,source_record_key)
);
ALTER TABLE business_application_record ADD COLUMN IF NOT EXISTS source_connector_id text;
ALTER TABLE business_application_record ADD COLUMN IF NOT EXISTS source_record_key text;
ALTER TABLE business_application_record ADD COLUMN IF NOT EXISTS source_observed_at timestamptz;
ALTER TABLE business_application_record ADD COLUMN IF NOT EXISTS source_evidence_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_record_connector_source ON business_application_record(organization_id,workspace_id,application_id,source_connector_id,source_record_key) WHERE source_connector_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_business_connector_scope ON business_data_connector(organization_id,workspace_id,application_id,status);
CREATE INDEX IF NOT EXISTS idx_business_sync_connector_created ON business_data_sync_batch(connector_id,created_at DESC);
COMMIT;
