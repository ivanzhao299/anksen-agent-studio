ALTER TABLE business_data_source_approval
  ADD COLUMN IF NOT EXISTS sequence_id bigserial;
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_source_approval_sequence
  ON business_data_source_approval(sequence_id);
CREATE INDEX IF NOT EXISTS idx_business_source_approval_latest_tenant
  ON business_data_source_approval(connector_id,tenant_id,sequence_id DESC);
