ALTER TABLE growth_tenant_feature_flag
  DROP CONSTRAINT IF EXISTS growth_feature_flag_secret_material_forbidden;
ALTER TABLE growth_tenant_feature_flag
  DROP CONSTRAINT IF EXISTS growth_feature_flag_key_valid;
