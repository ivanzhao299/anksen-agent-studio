import { randomUUID } from 'node:crypto';
import { assertTenantScope } from '../../growth-core/lib/domain-model.mjs';

const normalize = (value) => String(value ?? '').trim().toLowerCase();
const json = (value, fallback) => JSON.stringify(value ?? fallback);

export class PostgresGrowthStore {
  constructor({ pool }) {
    if (!pool) throw new Error('pool is required');
    this.pool = pool;
  }

  async upsertLead({ scope, lead }) {
    const s = assertTenantScope(scope);
    const result = await this.pool.query(
      `INSERT INTO growth_lead(id,organization_id,workspace_id,tenant_id,source,status,person,company,market_id,icp_id,external_refs,score,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11::jsonb,$12::jsonb,$13,$14)
       ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,person=EXCLUDED.person,company=EXCLUDED.company,market_id=EXCLUDED.market_id,icp_id=EXCLUDED.icp_id,external_refs=EXCLUDED.external_refs,score=EXCLUDED.score,updated_at=EXCLUDED.updated_at
       WHERE growth_lead.organization_id=EXCLUDED.organization_id AND growth_lead.workspace_id=EXCLUDED.workspace_id AND growth_lead.tenant_id=EXCLUDED.tenant_id
       RETURNING *`,
      [lead.leadId, s.organizationId, s.workspaceId, s.tenantId, lead.source, lead.status ?? 'NEW', json(lead.person, {}), json(lead.company, {}), lead.marketId ?? null, lead.icpId ?? null, json(lead.externalRefs, []), json(lead.score, null), lead.createdAt ?? new Date(), new Date()]
    );
    if (!result.rowCount) throw new Error('cross-tenant growth lead update denied');
    return result.rows[0];
  }

  async resolveIdentity({ scope, identityType, value, leadId, source = 'growth-core' }) {
    const s = assertTenantScope(scope), normalizedValue = normalize(value);
    if (!normalizedValue) throw new Error('identity value is required');
    const inserted = await this.pool.query(
      `INSERT INTO growth_identity(id,organization_id,workspace_id,tenant_id,lead_id,identity_type,normalized_value,source)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(organization_id,workspace_id,tenant_id,identity_type,normalized_value) DO NOTHING
       RETURNING lead_id`,
      [randomUUID(), s.organizationId, s.workspaceId, s.tenantId, leadId, identityType, normalizedValue, source]
    );
    if (inserted.rowCount) return { leadId: inserted.rows[0].lead_id, matched: false };
    const existing = await this.pool.query(
      `SELECT lead_id FROM growth_identity WHERE organization_id=$1 AND workspace_id=$2 AND tenant_id=$3 AND identity_type=$4 AND normalized_value=$5`,
      [s.organizationId, s.workspaceId, s.tenantId, identityType, normalizedValue]
    );
    if (!existing.rowCount) throw new Error('identity resolution conflict could not be read');
    return { leadId: existing.rows[0].lead_id, matched: true };
  }

  async appendEvent({ scope, event }) {
    const s = assertTenantScope(scope);
    await this.pool.query(
      `INSERT INTO growth_event(event_id,organization_id,workspace_id,tenant_id,event_type,subject_type,subject_id,source,idempotency_key,payload,schema_version,occurred_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12) ON CONFLICT DO NOTHING`,
      [event.eventId, s.organizationId, s.workspaceId, s.tenantId, event.eventType, event.subjectType, event.subjectId, event.source, event.idempotencyKey, json(event.payload, {}), event.schemaVersion ?? 1, event.occurredAt]
    );
  }

  async recordEngagement({ scope, engagement }) {
    const s = assertTenantScope(scope);
    await this.pool.query(
      `INSERT INTO growth_engagement(id,organization_id,workspace_id,tenant_id,lead_id,kind,channel,payload,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [engagement.id, s.organizationId, s.workspaceId, s.tenantId, engagement.leadId, engagement.kind, engagement.channel ?? null, json(engagement.payload, {}), engagement.occurredAt]
    );
  }

  async upsertOpportunity({ scope, opportunity, downstreamRef = null }) {
    const s = assertTenantScope(scope);
    const result = await this.pool.query(
      `INSERT INTO growth_opportunity(id,organization_id,workspace_id,tenant_id,lead_id,stage,score,downstream_ref)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       ON CONFLICT(id) DO UPDATE SET stage=EXCLUDED.stage,score=EXCLUDED.score,downstream_ref=EXCLUDED.downstream_ref,updated_at=now()
       WHERE growth_opportunity.organization_id=EXCLUDED.organization_id AND growth_opportunity.workspace_id=EXCLUDED.workspace_id AND growth_opportunity.tenant_id=EXCLUDED.tenant_id
       RETURNING *`,
      [opportunity.id, s.organizationId, s.workspaceId, s.tenantId, opportunity.leadId, opportunity.stage, opportunity.score ?? null, json(downstreamRef, null)]
    );
    if (!result.rowCount) throw new Error('cross-tenant growth opportunity update denied');
    return result.rows[0];
  }

  async recordRevenue({ scope, revenue }) {
    const s = assertTenantScope(scope);
    await this.pool.query(
      `INSERT INTO growth_revenue_attribution(id,organization_id,workspace_id,tenant_id,opportunity_id,lead_id,amount,currency,attributed_at,metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [revenue.id, s.organizationId, s.workspaceId, s.tenantId, revenue.opportunityId, revenue.leadId, revenue.amount, revenue.currency, revenue.attributedAt, json(revenue.metadata, {})]
    );
  }

  async customer360({ scope, leadId }) {
    const s = assertTenantScope(scope);
    const [lead, identities, engagements, opportunities, revenue, events] = await Promise.all([
      this.pool.query(`SELECT * FROM growth_lead WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4`, [leadId,s.organizationId,s.workspaceId,s.tenantId]),
      this.pool.query(`SELECT identity_type,normalized_value,source,created_at FROM growth_identity WHERE lead_id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4 ORDER BY created_at`, [leadId,s.organizationId,s.workspaceId,s.tenantId]),
      this.pool.query(`SELECT id,kind,channel,payload,occurred_at FROM growth_engagement WHERE lead_id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4 ORDER BY occurred_at DESC`, [leadId,s.organizationId,s.workspaceId,s.tenantId]),
      this.pool.query(`SELECT id,stage,score,downstream_ref,created_at,updated_at FROM growth_opportunity WHERE lead_id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4 ORDER BY updated_at DESC`, [leadId,s.organizationId,s.workspaceId,s.tenantId]),
      this.pool.query(`SELECT opportunity_id,amount,currency,attributed_at,metadata FROM growth_revenue_attribution WHERE lead_id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4 ORDER BY attributed_at DESC`, [leadId,s.organizationId,s.workspaceId,s.tenantId]),
      this.pool.query(`SELECT event_type,subject_type,subject_id,payload,occurred_at FROM growth_event WHERE subject_id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4 ORDER BY occurred_at DESC LIMIT 200`, [leadId,s.organizationId,s.workspaceId,s.tenantId])
    ]);
    if (!lead.rowCount) return null;
    const totalRevenue = revenue.rows.reduce((sum,row)=>sum+Number(row.amount||0),0);
    return { scope:s, lead:lead.rows[0], identities:identities.rows, engagements:engagements.rows, opportunities:opportunities.rows, revenue:revenue.rows, totalRevenue, timeline:events.rows };
  }
}
