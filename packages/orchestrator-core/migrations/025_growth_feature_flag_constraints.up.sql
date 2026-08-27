DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'growth_feature_flag_key_valid'
      AND conrelid = 'growth_tenant_feature_flag'::regclass
  ) THEN
    ALTER TABLE growth_tenant_feature_flag
      ADD CONSTRAINT growth_feature_flag_key_valid
      CHECK (flag_key ~ '^[A-Z][A-Z0-9_]{2,79}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'growth_feature_flag_secret_material_forbidden'
      AND conrelid = 'growth_tenant_feature_flag'::regclass
  ) THEN
    ALTER TABLE growth_tenant_feature_flag
      ADD CONSTRAINT growth_feature_flag_secret_material_forbidden
      CHECK (
        authorization_reference_id IS NULL OR
        authorization_reference_id !~* '^(sk-|gh[pousr]_)|bearer[[:space:]]|password[[:space:]]*=|token[[:space:]]*=|api[_-]?key[[:space:]]*=|-----BEGIN|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.'
      );
  END IF;
END;
$$;
