DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_delivery_operation'::regclass AND conname='growth_delivery_control_valid') THEN
    ALTER TABLE growth_delivery_operation ADD CONSTRAINT growth_delivery_control_valid CHECK (
      id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
      AND request_fingerprint ~ '^[a-f0-9]{64}$'
      AND last_actor_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
      AND version>=1 AND attempts>=0 AND attempts<=max_attempts
      AND (last_error IS NULL OR (jsonb_typeof(last_error)='object' AND octet_length(last_error::text)<=4096))
    ) NOT VALID;
  END IF;
END;
$$;
