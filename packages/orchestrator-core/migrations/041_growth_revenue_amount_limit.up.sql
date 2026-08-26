DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_revenue_attribution'::regclass AND conname='growth_revenue_amount_bounded') THEN
    ALTER TABLE growth_revenue_attribution ADD CONSTRAINT growth_revenue_amount_bounded CHECK (amount<=1000000000000) NOT VALID;
  END IF;
END;
$$;
