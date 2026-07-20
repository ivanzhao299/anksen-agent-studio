BEGIN;
CREATE TABLE IF NOT EXISTS business_record_relation(
  id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  application_id text NOT NULL,
  source_record_id uuid NOT NULL REFERENCES business_application_record(id),
  target_record_id uuid NOT NULL REFERENCES business_application_record(id),
  relation_type text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(source_record_id <> target_record_id),
  UNIQUE(organization_id,workspace_id,source_record_id,target_record_id,relation_type)
);
CREATE INDEX IF NOT EXISTS idx_business_relation_source ON business_record_relation(organization_id,workspace_id,source_record_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_relation_target ON business_record_relation(organization_id,workspace_id,target_record_id,created_at DESC);
COMMIT;
