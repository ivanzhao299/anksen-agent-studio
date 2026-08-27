ALTER TABLE growth_revenue_attribution
  DROP CONSTRAINT IF EXISTS growth_revenue_tenant_opportunity_fk,
  DROP CONSTRAINT IF EXISTS growth_revenue_tenant_lead_fk;
ALTER TABLE growth_opportunity DROP CONSTRAINT IF EXISTS growth_opportunity_tenant_lead_fk;
ALTER TABLE growth_score_snapshot DROP CONSTRAINT IF EXISTS growth_score_tenant_lead_fk;
ALTER TABLE growth_engagement DROP CONSTRAINT IF EXISTS growth_engagement_tenant_lead_fk;
ALTER TABLE growth_identity DROP CONSTRAINT IF EXISTS growth_identity_tenant_lead_fk;
ALTER TABLE growth_opportunity DROP CONSTRAINT IF EXISTS growth_opportunity_scope_identity;
ALTER TABLE growth_lead DROP CONSTRAINT IF EXISTS growth_lead_scope_identity;
