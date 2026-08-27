BEGIN;
ALTER TABLE business_data_source_approval ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE business_data_source_approval ADD COLUMN IF NOT EXISTS expires_at timestamptz;
DROP INDEX IF EXISTS uq_business_source_pending_approval;
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_source_pending_approval_unscoped
  ON business_data_source_approval(connector_id)
  WHERE status='PENDING' AND tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_source_pending_approval_tenant
  ON business_data_source_approval(connector_id,tenant_id)
  WHERE status='PENDING' AND tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_business_source_approval_tenant_readiness
  ON business_data_source_approval(organization_id,workspace_id,tenant_id,connector_id,status,expires_at DESC);
COMMIT;
