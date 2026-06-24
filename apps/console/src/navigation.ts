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
  { id: "dashboard", label: "总览", route: "/agent-studio", source: "runtime/global/platform-state.json", readOnly: true },
  { id: "projects", label: "项目", route: "/agent-studio/projects", source: "runtime/projects", readOnly: true },
  { id: "projectConnector", label: "项目接入", route: "/agent-studio/project-connector", source: "packages/project-connector/examples", readOnly: true },
  { id: "runtimeCenter", label: "运行时", route: "/agent-studio/runtime", source: "packages/runtime-center/examples", readOnly: true },
  { id: "runtimeAdapters", label: "运行适配器", route: "/agent-studio/adapters", source: "packages/runtime-adapters/examples", readOnly: true },
  { id: "credentialVault", label: "凭证", route: "/agent-studio/credentials", source: "packages/credential-vault/examples", readOnly: true },
  { id: "governance", label: "治理", route: "/agent-studio/governance", source: "packages/governance-center/examples", readOnly: true },
  { id: "actionCenter", label: "操作中心", route: "/agent-studio/actions", source: "apps/console/examples/console-actions.example.json", readOnly: true },
  { id: "planning", label: "规划", route: "/agent-studio/planning", source: "packages/planning-center and runtime/global/roadmap-memory.json", readOnly: true },
  { id: "v5Roadmap", label: "V5 路线", route: "/agent-studio/v5-roadmap", source: "runtime/global/v5-roadmap.json", readOnly: true },
  { id: "autopilot", label: "自动驾驶", route: "/agent-studio/autopilot", source: "autopilot-runs", readOnly: true },
  { id: "memory", label: "记忆中心", route: "/agent-studio/memory", source: "runtime/global and runtime/projects", readOnly: true },
  { id: "evolutionDiscovery", label: "演进 / 发现", route: "/agent-studio/evolution-discovery", source: "packages/evolution-center and packages/discovery-engine", readOnly: true }
] as const;
