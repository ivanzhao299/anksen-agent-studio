BEGIN;

CREATE TABLE IF NOT EXISTS business_application_record(
  id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  application_id text NOT NULL,
  object_type text NOT NULL,
  display_key text NOT NULL,
  title text NOT NULL,
  status text NOT NULL,
  owner_id text NOT NULL,
  fields jsonb NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'POSTGRESQL_BUSINESS_APPLICATION_STORE',
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, workspace_id, application_id, display_key)
);
CREATE INDEX IF NOT EXISTS idx_business_record_scope_updated ON business_application_record(organization_id, workspace_id, application_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS business_work_item(
  id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  application_id text NOT NULL,
  business_record_id uuid NOT NULL REFERENCES business_application_record(id),
  business_object_type text NOT NULL,
  business_display_key text NOT NULL,
  business_object_version integer NOT NULL,
  title text NOT NULL,
  status text NOT NULL,
  assignment_type text NOT NULL CHECK(assignment_type IN ('HUMAN','AGENT')),
  assignee_id text NOT NULL,
  delegated_by text NOT NULL,
  priority text NOT NULL,
  idempotency_key text NOT NULL,
  kernel_task_id uuid,
  kernel_goal_id uuid,
  session_id uuid,
  result_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, workspace_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_business_work_assignee ON business_work_item(organization_id, workspace_id, assignee_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_work_record ON business_work_item(business_record_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS business_application_event(
  id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  event_type text NOT NULL,
  application_id text NOT NULL,
  object_type text,
  object_id uuid,
  object_version integer,
  work_item_id uuid,
  actor_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE business_application_event ADD COLUMN IF NOT EXISTS sequence bigserial;
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_event_sequence ON business_application_event(sequence);
CREATE INDEX IF NOT EXISTS idx_business_event_scope_created ON business_application_event(organization_id, workspace_id, application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_event_object ON business_application_event(object_id, created_at);

COMMIT;
