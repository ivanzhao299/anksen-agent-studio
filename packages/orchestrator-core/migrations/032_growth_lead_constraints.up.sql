DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_lead'::regclass AND conname='growth_lead_contract_valid') THEN
    ALTER TABLE growth_lead ADD CONSTRAINT growth_lead_contract_valid CHECK (
      id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
      AND source ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$'
      AND status ~ '^[A-Z][A-Z0-9_]{1,63}$'
      AND jsonb_typeof(person)='object' AND octet_length(person::text)<=32768
      AND jsonb_typeof(company)='object' AND octet_length(company::text)<=32768
      AND jsonb_typeof(external_refs)='array' AND octet_length(external_refs::text)<=65536
      AND (score IS NULL OR (jsonb_typeof(score)='object' AND octet_length(score::text)<=65536))
      AND (market_id IS NULL OR market_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$')
      AND (icp_id IS NULL OR icp_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$')
    ) NOT VALID;
  END IF;
END;
$$;
