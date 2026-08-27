DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_identity'::regclass AND conname='growth_identity_value_valid') THEN
    ALTER TABLE growth_identity ADD CONSTRAINT growth_identity_value_valid CHECK (
      identity_type IN ('EMAIL','PHONE','DOMAIN')
      AND char_length(normalized_value) BETWEEN 3 AND 320
      AND normalized_value !~ '[[:cntrl:]]'
      AND normalized_value=lower(normalized_value)
      AND CASE identity_type
        WHEN 'EMAIL' THEN normalized_value ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        WHEN 'PHONE' THEN normalized_value ~ '^\+?[0-9]{7,20}$'
        WHEN 'DOMAIN' THEN normalized_value ~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
        ELSE false
      END
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_identity'::regclass AND conname='growth_identity_source_valid') THEN
    ALTER TABLE growth_identity ADD CONSTRAINT growth_identity_source_valid CHECK (source ~ '^[A-Z][A-Z0-9_]{1,63}$');
  END IF;
END;
$$;
