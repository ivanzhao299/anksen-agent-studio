ALTER TABLE growth_identity
  DROP CONSTRAINT IF EXISTS growth_identity_source_valid,
  DROP CONSTRAINT IF EXISTS growth_identity_value_valid;
