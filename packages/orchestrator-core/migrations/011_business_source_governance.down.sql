BEGIN;
DROP TABLE IF EXISTS business_data_sync_checkpoint;
DROP INDEX IF EXISTS uq_business_source_pending_approval;
DROP TABLE IF EXISTS business_data_source_approval;
COMMIT;
