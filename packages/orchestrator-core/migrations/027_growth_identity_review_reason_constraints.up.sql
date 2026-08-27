DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='growth_identity_review_case'::regclass
      AND conname='growth_identity_review_reason_valid'
  ) THEN
    ALTER TABLE growth_identity_review_case
      ADD CONSTRAINT growth_identity_review_reason_valid CHECK (
        resolution_reason IS NULL OR (
          char_length(resolution_reason) BETWEEN 1 AND 500
          AND resolution_reason !~ '[[:cntrl:]]'
          AND resolution_reason !~* '(^|[[:space:]])(sk-|gh[pousr]_)|bearer[[:space:]]|password[[:space:]]*=|token[[:space:]]*=|api[_-]?key[[:space:]]*=|-----BEGIN|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.'
        )
      );
  END IF;
END;
$$;
