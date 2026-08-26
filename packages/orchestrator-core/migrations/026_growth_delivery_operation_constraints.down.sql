ALTER TABLE growth_delivery_operation
  DROP CONSTRAINT IF EXISTS growth_delivery_capability_valid,
  DROP CONSTRAINT IF EXISTS growth_delivery_operation_type_valid;
