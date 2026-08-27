DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_opportunity'::regclass AND conname='growth_opportunity_contract_valid') THEN
    ALTER TABLE growth_opportunity ADD CONSTRAINT growth_opportunity_contract_valid CHECK (
      id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
      AND lead_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
      AND stage ~ '^[A-Z][A-Z0-9_]{1,63}$'
      AND (score IS NULL OR (score>=0 AND score<=100))
      AND (downstream_ref IS NULL OR (jsonb_typeof(downstream_ref)='object' AND octet_length(downstream_ref::text)<=65536))
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_revenue_attribution'::regclass AND conname='growth_revenue_contract_valid') THEN
    ALTER TABLE growth_revenue_attribution ADD CONSTRAINT growth_revenue_contract_valid CHECK (
      id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
      AND opportunity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
      AND lead_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
      AND amount>=0
      AND currency ~ '^[A-Z]{3}$'
      AND jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=65536
    ) NOT VALID;
  END IF;
END;
$$;
