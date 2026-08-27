DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_score_snapshot'::regclass AND conname='growth_score_contract_valid') THEN
    ALTER TABLE growth_score_snapshot ADD CONSTRAINT growth_score_contract_valid CHECK (
      id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
      AND lead_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
      AND score_type ~ '^[A-Z][A-Z0-9_]{1,63}$'
      AND jsonb_typeof(factors)='array' AND octet_length(factors::text)<=65536
      AND jsonb_typeof(dimensions)='object' AND octet_length(dimensions::text)<=65536
      AND model_version ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
      AND policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
    ) NOT VALID;
  END IF;
END;
$$;
