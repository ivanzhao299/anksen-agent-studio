DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_identity'::regclass AND conname='growth_identity_root_valid') THEN
    ALTER TABLE growth_identity ADD CONSTRAINT growth_identity_root_valid CHECK (
      lead_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
    ) NOT VALID;
  END IF;
END;
$$;
