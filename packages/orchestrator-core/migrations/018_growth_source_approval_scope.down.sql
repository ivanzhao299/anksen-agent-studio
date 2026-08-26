BEGIN;
DROP INDEX IF EXISTS idx_business_source_approval_tenant_readiness;
DROP INDEX IF EXISTS uq_business_source_pending_approval_tenant;
DROP INDEX IF EXISTS uq_business_source_pending_approval_unscoped;
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_source_pending_approval
  ON business_data_source_approval(connector_id)
  WHERE status='PENDING';
ALTER TABLE business_data_source_approval DROP COLUMN IF EXISTS expires_at;
ALTER TABLE business_data_source_approval DROP COLUMN IF EXISTS tenant_id;
COMMIT;
