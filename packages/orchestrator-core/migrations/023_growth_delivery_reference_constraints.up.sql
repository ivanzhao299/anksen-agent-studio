DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'growth_delivery_reference_only'
      AND conrelid = 'growth_delivery_operation'::regclass
  ) THEN
    ALTER TABLE growth_delivery_operation
      ADD CONSTRAINT growth_delivery_reference_only CHECK (
        asset_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{2,255}$'
        AND adapter_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{2,255}$'
        AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{2,255}$'
        AND (approval_ref IS NULL OR approval_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{2,255}$')
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'growth_delivery_secret_material_forbidden'
      AND conrelid = 'growth_delivery_operation'::regclass
  ) THEN
    ALTER TABLE growth_delivery_operation
      ADD CONSTRAINT growth_delivery_secret_material_forbidden CHECK (
        concat_ws(' ',idempotency_key,adapter_id,asset_ref,approval_ref)
          !~* '(^|[[:space:]])(sk-|gh[pousr]_)|bearer[[:space:]]|password[[:space:]]*=|token[[:space:]]*=|api[_-]?key[[:space:]]*=|-----BEGIN|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.'
      );
  END IF;
END;
$$;
