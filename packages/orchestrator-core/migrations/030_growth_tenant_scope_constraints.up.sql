DO $$
DECLARE
  table_name text;
  constraint_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'growth_lead','growth_identity','growth_engagement','growth_opportunity',
    'growth_revenue_attribution','growth_event','growth_score_snapshot',
    'growth_delivery_operation','growth_delivery_event',
    'growth_identity_review_case','growth_identity_review_event',
    'growth_connector_binding','growth_connector_binding_event',
    'growth_tenant_feature_flag','growth_tenant_feature_flag_event'
  ] LOOP
    constraint_name := table_name || '_tenant_scope_valid';
    IF to_regclass(table_name) IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass(table_name) AND conname=constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I CHECK (organization_id ~ %L AND workspace_id ~ %L AND tenant_id ~ %L)',
        table_name,constraint_name,
        '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$',
        '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$',
        '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
      );
    END IF;
  END LOOP;
END;
$$;
