CREATE OR REPLACE FUNCTION reject_growth_feature_flag_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'GROWTH_FEATURE_FLAG_EVENT_IMMUTABLE' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'growth_feature_flag_event_immutable'
      AND tgrelid = 'growth_tenant_feature_flag_event'::regclass
  ) THEN
    CREATE TRIGGER growth_feature_flag_event_immutable
    BEFORE UPDATE OR DELETE ON growth_tenant_feature_flag_event
    FOR EACH ROW EXECUTE FUNCTION reject_growth_feature_flag_event_mutation();
  END IF;
END;
$$;
