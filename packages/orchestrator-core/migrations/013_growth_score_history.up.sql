CREATE TABLE IF NOT EXISTS growth_score_snapshot (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  tenant_id text NOT NULL,
  lead_id text NOT NULL REFERENCES growth_lead(id) ON DELETE CASCADE,
  score_type text NOT NULL,
  value numeric NOT NULL CHECK (value >= 0 AND value <= 100),
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_version text NOT NULL,
  policy_version text NOT NULL,
  calculated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'growth_score_snapshot'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE growth_score_snapshot DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS growth_score_snapshot_lead_idx
  ON growth_score_snapshot(organization_id,workspace_id,tenant_id,lead_id,calculated_at DESC);
