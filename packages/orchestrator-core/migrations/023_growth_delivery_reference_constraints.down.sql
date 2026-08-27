ALTER TABLE growth_delivery_operation
  DROP CONSTRAINT IF EXISTS growth_delivery_secret_material_forbidden;
ALTER TABLE growth_delivery_operation
  DROP CONSTRAINT IF EXISTS growth_delivery_reference_only;
