DROP INDEX IF EXISTS idx_business_source_approval_latest_tenant;
DROP INDEX IF EXISTS uq_business_source_approval_sequence;
ALTER TABLE business_data_source_approval DROP COLUMN IF EXISTS sequence_id;
