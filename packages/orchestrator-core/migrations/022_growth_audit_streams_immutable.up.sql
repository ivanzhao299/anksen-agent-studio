CREATE OR REPLACE FUNCTION reject_growth_audit_stream_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'GROWTH_AUDIT_STREAM_IMMUTABLE:%', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE table_name text;
DECLARE trigger_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'growth_event',
    'growth_score_snapshot',
    'growth_delivery_event',
    'growth_identity_review_event',
    'growth_connector_binding_event'
  ] LOOP
    trigger_name := table_name || '_immutable';
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = trigger_name AND tgrelid = table_name::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_growth_audit_stream_mutation()',
        trigger_name,
        table_name
      );
    END IF;
  END LOOP;
END;
$$;
