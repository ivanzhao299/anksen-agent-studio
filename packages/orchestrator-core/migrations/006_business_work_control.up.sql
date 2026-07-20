BEGIN;
ALTER TABLE business_work_item ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK(version > 0);
CREATE INDEX IF NOT EXISTS idx_business_work_kernel_goal ON business_work_item(kernel_goal_id) WHERE kernel_goal_id IS NOT NULL;
COMMIT;
