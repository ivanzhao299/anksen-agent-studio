BEGIN;
CREATE TABLE IF NOT EXISTS business_runner_node(
  id uuid PRIMARY KEY,
  node_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK(status IN ('ONLINE','DRAINING','OFFLINE')),
  desired_state text NOT NULL CHECK(desired_state IN ('ONLINE','DRAINING')),
  capacity integer NOT NULL CHECK(capacity > 0),
  active_count integer NOT NULL DEFAULT 0 CHECK(active_count >= 0),
  process_started_at timestamptz NOT NULL,
  last_heartbeat_at timestamptz NOT NULL,
  stopped_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_runner_heartbeat ON business_runner_node(status,last_heartbeat_at);
CREATE TABLE IF NOT EXISTS business_runner_event(
  id bigserial PRIMARY KEY,
  node_id uuid NOT NULL REFERENCES business_runner_node(id),
  event_type text NOT NULL,
  actor_id text NOT NULL,
  previous_state text,
  next_state text,
  node_version integer NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_runner_event_node ON business_runner_event(node_id,id DESC);
COMMIT;
