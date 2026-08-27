DROP TRIGGER IF EXISTS growth_feature_flag_event_immutable
  ON growth_tenant_feature_flag_event;
DROP FUNCTION IF EXISTS reject_growth_feature_flag_event_mutation();
