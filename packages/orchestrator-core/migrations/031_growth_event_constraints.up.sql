DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_event'::regclass AND conname='growth_event_contract_valid') THEN
    ALTER TABLE growth_event ADD CONSTRAINT growth_event_contract_valid CHECK (
      event_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
      AND event_type IN (
        'growth.prospect.discovered','growth.lead.normalized',
        'growth.signal.observed','growth.score.calculated',
        'growth.content.published','growth.engagement.received',
        'growth.opportunity.qualified','growth.revenue.attributed'
      )
      AND (subject_type IS NULL OR subject_type ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$')
      AND subject_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
      AND source ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$'
      AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,254}$'
      AND schema_version BETWEEN 1 AND 100
      AND jsonb_typeof(payload)='object'
      AND octet_length(payload::text)<=65536
    ) NOT VALID;
  END IF;
END;
$$;
