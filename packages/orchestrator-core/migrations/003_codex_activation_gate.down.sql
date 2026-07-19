BEGIN;
DROP TABLE IF EXISTS ad_session_projection;
DROP TABLE IF EXISTS ad_outbox_consumption;
DROP TABLE IF EXISTS ad_credential_reference_binding;
DROP TABLE IF EXISTS ad_runtime_approval;
DROP TABLE IF EXISTS ad_project_runtime_policy;
COMMIT;
