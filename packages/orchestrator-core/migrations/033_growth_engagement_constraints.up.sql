DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_engagement'::regclass AND conname='growth_engagement_contract_valid') THEN
    ALTER TABLE growth_engagement ADD CONSTRAINT growth_engagement_contract_valid CHECK (
      id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
      AND lead_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
      AND kind ~ '^[A-Z][A-Z0-9_]{1,63}$'
      AND (channel IS NULL OR channel ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$')
      AND jsonb_typeof(payload)='object' AND octet_length(payload::text)<=65536
    ) NOT VALID;
  END IF;
END;
$$;
