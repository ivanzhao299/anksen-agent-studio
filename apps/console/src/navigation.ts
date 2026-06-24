export type ConsolePageId =
  | "dashboard"
  | "projects"
  | "projectConnector"
  | "runtimeCenter"
  | "runtimeAdapters"
  | "credentialVault"
  | "governance"
  | "actionCenter"
  | "planning"
  | "v5Roadmap"
  | "autopilot"
  | "memory"
  | "evolutionDiscovery";

export interface ConsoleNavigationItem {
  readonly id: ConsolePageId;
  readonly label: string;
  readonly route: string;
  readonly source: string;
  readonly readOnly: true;
}

export const consoleNavigation: readonly ConsoleNavigationItem[] = [
  { id: "dashboard", label: "Dashboard", route: "/agent-studio", source: "runtime/global/platform-state.json", readOnly: true },
  { id: "projects", label: "Projects", route: "/agent-studio/projects", source: "runtime/projects", readOnly: true },
  { id: "projectConnector", label: "Project Connector", route: "/agent-studio/project-connector", source: "packages/project-connector/examples", readOnly: true },
  { id: "runtimeCenter", label: "Runtime Center", route: "/agent-studio/runtime", source: "packages/runtime-center/examples", readOnly: true },
  { id: "runtimeAdapters", label: "Runtime Adapters", route: "/agent-studio/adapters", source: "packages/runtime-adapters/examples", readOnly: true },
  { id: "credentialVault", label: "Credential Vault", route: "/agent-studio/credentials", source: "packages/credential-vault/examples", readOnly: true },
  { id: "governance", label: "Governance", route: "/agent-studio/governance", source: "packages/governance-center/examples", readOnly: true },
  { id: "actionCenter", label: "Action Center", route: "/agent-studio/actions", source: "apps/console/examples/console-actions.example.json", readOnly: true },
  { id: "planning", label: "Planning", route: "/agent-studio/planning", source: "packages/planning-center and runtime/global/roadmap-memory.json", readOnly: true },
  { id: "v5Roadmap", label: "V5 Roadmap", route: "/agent-studio/v5-roadmap", source: "runtime/global/v5-roadmap.json", readOnly: true },
  { id: "autopilot", label: "Autopilot Runs", route: "/agent-studio/autopilot", source: "autopilot-runs", readOnly: true },
  { id: "memory", label: "Memory / Context", route: "/agent-studio/memory", source: "runtime/global and runtime/projects", readOnly: true },
  { id: "evolutionDiscovery", label: "Evolution / Discovery", route: "/agent-studio/evolution-discovery", source: "packages/evolution-center and packages/discovery-engine", readOnly: true }
] as const;
