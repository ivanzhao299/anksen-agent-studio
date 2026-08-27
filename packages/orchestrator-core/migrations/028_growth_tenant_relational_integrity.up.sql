DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_lead'::regclass AND conname='growth_lead_scope_identity') THEN
    ALTER TABLE growth_lead ADD CONSTRAINT growth_lead_scope_identity UNIQUE (id,organization_id,workspace_id,tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_opportunity'::regclass AND conname='growth_opportunity_scope_identity') THEN
    ALTER TABLE growth_opportunity ADD CONSTRAINT growth_opportunity_scope_identity UNIQUE (id,organization_id,workspace_id,tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_identity'::regclass AND conname='growth_identity_tenant_lead_fk') THEN
    ALTER TABLE growth_identity ADD CONSTRAINT growth_identity_tenant_lead_fk FOREIGN KEY (lead_id,organization_id,workspace_id,tenant_id) REFERENCES growth_lead(id,organization_id,workspace_id,tenant_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_engagement'::regclass AND conname='growth_engagement_tenant_lead_fk') THEN
    ALTER TABLE growth_engagement ADD CONSTRAINT growth_engagement_tenant_lead_fk FOREIGN KEY (lead_id,organization_id,workspace_id,tenant_id) REFERENCES growth_lead(id,organization_id,workspace_id,tenant_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_score_snapshot'::regclass AND conname='growth_score_tenant_lead_fk') THEN
    ALTER TABLE growth_score_snapshot ADD CONSTRAINT growth_score_tenant_lead_fk FOREIGN KEY (lead_id,organization_id,workspace_id,tenant_id) REFERENCES growth_lead(id,organization_id,workspace_id,tenant_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_opportunity'::regclass AND conname='growth_opportunity_tenant_lead_fk') THEN
    ALTER TABLE growth_opportunity ADD CONSTRAINT growth_opportunity_tenant_lead_fk FOREIGN KEY (lead_id,organization_id,workspace_id,tenant_id) REFERENCES growth_lead(id,organization_id,workspace_id,tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_revenue_attribution'::regclass AND conname='growth_revenue_tenant_lead_fk') THEN
    ALTER TABLE growth_revenue_attribution ADD CONSTRAINT growth_revenue_tenant_lead_fk FOREIGN KEY (lead_id,organization_id,workspace_id,tenant_id) REFERENCES growth_lead(id,organization_id,workspace_id,tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='growth_revenue_attribution'::regclass AND conname='growth_revenue_tenant_opportunity_fk') THEN
    ALTER TABLE growth_revenue_attribution ADD CONSTRAINT growth_revenue_tenant_opportunity_fk FOREIGN KEY (opportunity_id,organization_id,workspace_id,tenant_id) REFERENCES growth_opportunity(id,organization_id,workspace_id,tenant_id);
  END IF;
END;
$$;
