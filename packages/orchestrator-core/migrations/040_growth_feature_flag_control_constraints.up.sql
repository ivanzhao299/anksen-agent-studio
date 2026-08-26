DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_tenant_feature_flag'::regclass AND conname='growth_feature_flag_control_valid') THEN
    ALTER TABLE growth_tenant_feature_flag ADD CONSTRAINT growth_feature_flag_control_valid CHECK (
      id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{2,159}$'
      AND last_actor_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{2,159}$'
      AND (authorization_reference_id IS NULL OR authorization_reference_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{2,159}$')
      AND (enabled OR (authorization_reference_id IS NULL AND expires_at IS NULL))
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_tenant_feature_flag_event'::regclass AND conname='growth_feature_flag_event_control_valid') THEN
    ALTER TABLE growth_tenant_feature_flag_event ADD CONSTRAINT growth_feature_flag_event_control_valid CHECK (
      flag_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{2,159}$'
      AND flag_key ~ '^[A-Z][A-Z0-9_]{2,79}$'
      AND flag_version>=1
      AND actor_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{2,159}$'
      AND (authorization_reference_hash IS NULL OR authorization_reference_hash ~ '^[a-f0-9]{64}$')
      AND (enabled OR (authorization_reference_hash IS NULL AND expires_at IS NULL))
    ) NOT VALID;
  END IF;
END;
$$;
