ALTER TABLE growth_delivery_operation ADD COLUMN IF NOT EXISTS last_actor_id text NOT NULL DEFAULT 'SYSTEM';

CREATE TABLE IF NOT EXISTS growth_delivery_event (
  sequence_id bigserial PRIMARY KEY,
  operation_id text NOT NULL REFERENCES growth_delivery_operation(id) ON DELETE CASCADE,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  tenant_id text NOT NULL,
  event_type text NOT NULL,
  previous_status text,
  next_status text NOT NULL,
  operation_version integer NOT NULL,
  actor_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS growth_delivery_event_operation_idx
  ON growth_delivery_event(organization_id,workspace_id,tenant_id,operation_id,sequence_id);

CREATE OR REPLACE FUNCTION audit_growth_delivery_operation() RETURNS trigger AS $$
DECLARE event_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN event_name := 'DELIVERY_REGISTERED';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    event_name := CASE NEW.status
      WHEN 'RUNNING' THEN 'DELIVERY_ATTEMPT_STARTED'
      WHEN 'RETRYABLE' THEN 'DELIVERY_RETRYABLE'
      WHEN 'FAILED' THEN 'DELIVERY_FAILED'
      WHEN 'COMPLETED' THEN 'DELIVERY_COMPLETED'
      ELSE 'DELIVERY_STATUS_CHANGED'
    END;
  ELSIF NEW.next_attempt_at IS DISTINCT FROM OLD.next_attempt_at THEN event_name := 'DELIVERY_RETRY_REQUESTED';
  ELSIF NEW.reconciliation_status IS DISTINCT FROM OLD.reconciliation_status THEN event_name := 'DELIVERY_RECONCILED';
  ELSE RETURN NEW;
  END IF;
  INSERT INTO growth_delivery_event(operation_id,organization_id,workspace_id,tenant_id,event_type,previous_status,next_status,operation_version,actor_id,payload,created_at)
  VALUES(NEW.id,NEW.organization_id,NEW.workspace_id,NEW.tenant_id,event_name,CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.status END,NEW.status,NEW.version,NEW.last_actor_id,jsonb_build_object('attempts',NEW.attempts,'maxAttempts',NEW.max_attempts,'reconciliationStatus',NEW.reconciliation_status,'errorCode',NEW.last_error->>'code'),NEW.updated_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS growth_delivery_operation_audit ON growth_delivery_operation;
CREATE TRIGGER growth_delivery_operation_audit AFTER INSERT OR UPDATE ON growth_delivery_operation
FOR EACH ROW EXECUTE FUNCTION audit_growth_delivery_operation();
