DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_identity_review_case'::regclass AND conname='growth_identity_review_contract_valid') THEN
    ALTER TABLE growth_identity_review_case ADD CONSTRAINT growth_identity_review_contract_valid CHECK (
      id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
      AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
      AND source ~ '^[A-Z][A-Z0-9_]{1,63}$'
      AND external_id_hash ~ '^[a-f0-9]{64}$'
      AND jsonb_typeof(candidate_lead_ids)='array' AND jsonb_array_length(candidate_lead_ids) BETWEEN 2 AND 20 AND octet_length(candidate_lead_ids::text)<=4096
      AND jsonb_typeof(identity_types)='array' AND jsonb_array_length(identity_types) BETWEEN 1 AND 3 AND identity_types <@ '["EMAIL","PHONE","DOMAIN"]'::jsonb
      AND (resolution_lead_id IS NULL OR resolution_lead_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$')
      AND version>=1
      AND (resolved_by IS NULL OR resolved_by ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$')
      AND last_actor_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
    ) NOT VALID;
  END IF;
END;
$$;
