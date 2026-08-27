CREATE TABLE IF NOT EXISTS growth_connector_binding (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  tenant_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('WEBSITE_INBOUND','PUBLISHING','BUSINESS_HANDOFF')),
  adapter_id text NOT NULL,
  transport text NOT NULL CHECK (transport IN ('SIGNED_WEBHOOK','OFFICIAL_API')),
  credential_reference_id text NOT NULL,
  endpoint_host text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  health_status text NOT NULL DEFAULT 'NOT_PROBED' CHECK (health_status IN ('NOT_PROBED','HEALTHY','UNHEALTHY')),
  health_evidence_hash text,
  health_observed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  last_actor_id text NOT NULL DEFAULT 'SYSTEM',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,workspace_id,tenant_id,kind),
  CHECK(credential_reference_id !~* '(token|password|secret|api[_-]?key)=')
);
CREATE INDEX IF NOT EXISTS growth_connector_binding_scope_idx ON growth_connector_binding(organization_id,workspace_id,tenant_id,kind);

CREATE TABLE IF NOT EXISTS growth_connector_binding_event (
  sequence_id bigserial PRIMARY KEY,
  binding_id text NOT NULL REFERENCES growth_connector_binding(id) ON DELETE CASCADE,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  tenant_id text NOT NULL,
  event_type text NOT NULL,
  binding_version integer NOT NULL,
  actor_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_connector_binding_event_idx ON growth_connector_binding_event(organization_id,workspace_id,tenant_id,binding_id,sequence_id);

CREATE OR REPLACE FUNCTION audit_growth_connector_binding() RETURNS trigger AS $$
DECLARE event_name text;
BEGIN
  IF TG_OP='INSERT' THEN event_name := 'CONNECTOR_BINDING_REGISTERED';
  ELSIF NEW.health_status IS DISTINCT FROM OLD.health_status OR NEW.health_observed_at IS DISTINCT FROM OLD.health_observed_at THEN event_name := 'CONNECTOR_HEALTH_RECORDED';
  ELSIF NEW.enabled IS DISTINCT FROM OLD.enabled THEN event_name := 'CONNECTOR_BINDING_ACTIVATION_CHANGED';
  ELSE event_name := 'CONNECTOR_BINDING_CONFIGURED';
  END IF;
  INSERT INTO growth_connector_binding_event(binding_id,organization_id,workspace_id,tenant_id,event_type,binding_version,actor_id,payload,created_at)
  VALUES(NEW.id,NEW.organization_id,NEW.workspace_id,NEW.tenant_id,event_name,NEW.version,NEW.last_actor_id,jsonb_build_object('kind',NEW.kind,'transport',NEW.transport,'endpointHost',NEW.endpoint_host,'enabled',NEW.enabled,'healthStatus',NEW.health_status),NEW.updated_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS growth_connector_binding_audit ON growth_connector_binding;
CREATE TRIGGER growth_connector_binding_audit AFTER INSERT OR UPDATE ON growth_connector_binding FOR EACH ROW EXECUTE FUNCTION audit_growth_connector_binding();
