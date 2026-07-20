BEGIN;
ALTER TABLE business_work_item ADD COLUMN IF NOT EXISTS result_summary jsonb;
ALTER TABLE business_work_item DROP CONSTRAINT IF EXISTS business_work_result_summary_object;
ALTER TABLE business_work_item ADD CONSTRAINT business_work_result_summary_object CHECK(result_summary IS NULL OR jsonb_typeof(result_summary)='object');
COMMIT;
