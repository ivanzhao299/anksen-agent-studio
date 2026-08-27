DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'growth_lead','growth_identity','growth_engagement','growth_opportunity',
    'growth_revenue_attribution','growth_event','growth_score_snapshot',
    'growth_delivery_operation','growth_delivery_event',
    'growth_identity_review_case','growth_identity_review_event',
    'growth_connector_binding','growth_connector_binding_event',
    'growth_tenant_feature_flag','growth_tenant_feature_flag_event'
  ] LOOP
    IF to_regclass(table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',table_name,table_name || '_tenant_scope_valid');
    END IF;
  END LOOP;
END;
$$;
