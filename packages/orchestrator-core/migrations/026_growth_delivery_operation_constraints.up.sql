DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='growth_delivery_operation'::regclass
      AND conname='growth_delivery_operation_type_valid'
  ) THEN
    ALTER TABLE growth_delivery_operation
      ADD CONSTRAINT growth_delivery_operation_type_valid
      CHECK (operation_type IN ('PUBLISH','BUSINESS_HANDOFF'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='growth_delivery_operation'::regclass
      AND conname='growth_delivery_capability_valid'
  ) THEN
    ALTER TABLE growth_delivery_operation
      ADD CONSTRAINT growth_delivery_capability_valid
      CHECK (capability ~ '^[A-Z][A-Z0-9_]{1,63}$');
  END IF;
END;
$$;
