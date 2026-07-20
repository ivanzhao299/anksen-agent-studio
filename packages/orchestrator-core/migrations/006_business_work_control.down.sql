BEGIN;
DROP INDEX IF EXISTS idx_business_work_kernel_goal;
ALTER TABLE business_work_item DROP COLUMN IF EXISTS version;
COMMIT;
