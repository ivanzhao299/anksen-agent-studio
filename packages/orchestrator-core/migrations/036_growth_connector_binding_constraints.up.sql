DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_connector_binding'::regclass AND conname='growth_connector_binding_contract_valid') THEN
    ALTER TABLE growth_connector_binding ADD CONSTRAINT growth_connector_binding_contract_valid CHECK (
      id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
      AND adapter_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
      AND credential_reference_id ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,127}-ref$'
      AND endpoint_host ~ '^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
      AND endpoint_host <> 'localhost'
      AND endpoint_host !~ '^([0-9]+\.){3}[0-9]+$'
      AND version>=1
      AND last_actor_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
      AND (health_evidence_hash IS NULL OR health_evidence_hash ~ '^[a-f0-9]{64}$')
    ) NOT VALID;
  END IF;
END;
$$;
