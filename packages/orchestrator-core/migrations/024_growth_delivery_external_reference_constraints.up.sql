DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'growth_delivery_external_reference_only'
      AND conrelid = 'growth_delivery_operation'::regclass
  ) THEN
    ALTER TABLE growth_delivery_operation
      ADD CONSTRAINT growth_delivery_external_reference_only CHECK (
        (external_id IS NULL OR external_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$')
        AND (external_status IS NULL OR external_status ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$')
        AND concat_ws(' ',external_id,external_status)
          !~* '(^|[[:space:]])(sk-|gh[pousr]_)|bearer[[:space:]]|password[[:space:]]*=|token[[:space:]]*=|api[_-]?key[[:space:]]*=|-----BEGIN|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.'
      );
  END IF;
END;
$$;
