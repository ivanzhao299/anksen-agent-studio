CREATE TABLE IF NOT EXISTS growth_delivery_operation (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  tenant_id text NOT NULL,
  idempotency_key text NOT NULL,
  operation_type text NOT NULL,
  adapter_id text NOT NULL,
  capability text NOT NULL,
  asset_ref text NOT NULL,
  approval_ref text,
  request_fingerprint text NOT NULL,
  status text NOT NULL CHECK (status IN ('READY','RUNNING','RETRYABLE','COMPLETED','FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at timestamptz,
  external_id text,
  external_status text,
  reconciliation_status text NOT NULL DEFAULT 'PENDING' CHECK (reconciliation_status IN ('PENDING','MATCHED','MISMATCH','NOT_APPLICABLE')),
  last_error jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,workspace_id,tenant_id,idempotency_key)
);

CREATE INDEX IF NOT EXISTS growth_delivery_scope_idx
  ON growth_delivery_operation(organization_id,workspace_id,tenant_id,status,updated_at DESC);
