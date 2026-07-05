export const consoleApp = {
  name: "ANKSEN Agent Studio",
  status: "read-only-v4-expanded",
  mode: "read-only",
  framework_target: "Next.js App Router",
  data_policy: "local fixtures, package examples, autopilot run records, and runtime memory only",
  mutation_policy: "disabled",
  module_scope: "V4 platform status surfaces"
} as const;

export const consoleSafety = {
  database: "not connected",
  external_services: "not called",
  managed_project_writes: "disabled",
  agent_execution: "disabled",
  deploy: "disabled",
  production_operations: "disabled",
  server_access: "disabled",
  credential_values: "not read",
  secret_storage: "disabled"
} as const;
