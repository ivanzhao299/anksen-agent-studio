BEGIN;
ALTER TABLE business_work_item DROP CONSTRAINT IF EXISTS business_work_result_summary_object;
ALTER TABLE business_work_item DROP COLUMN IF EXISTS result_summary;
COMMIT;
