export const consoleApp = {
  name: "ANKSEN Agent Studio Console",
  status: "read-only-mvp",
  mode: "read-only",
  framework_target: "Next.js App Router",
  data_policy: "local fixtures and runtime memory only",
  mutation_policy: "disabled"
} as const;

export const consoleSafety = {
  database: "not connected",
  external_services: "not called",
  managed_project_writes: "disabled",
  deploy: "disabled",
  production_operations: "disabled",
  credential_values: "not read"
} as const;
