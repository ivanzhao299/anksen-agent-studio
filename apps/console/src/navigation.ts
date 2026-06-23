export type ConsolePageId =
  | "dashboard"
  | "projects"
  | "agents"
  | "skills"
  | "runtime"
  | "planning"
  | "evolution"
  | "discovery"
  | "memory";

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
  { id: "agents", label: "Agents", route: "/agent-studio/agents", source: "autopilot-runs", readOnly: true },
  { id: "skills", label: "Skills", route: "/agent-studio/skills", source: "packages/skill-router/registry", readOnly: true },
  { id: "runtime", label: "Runtime", route: "/agent-studio/runtime", source: "packages/runtime-center/examples", readOnly: true },
  { id: "planning", label: "Planning", route: "/agent-studio/planning", source: "packages/planning-center/examples", readOnly: true },
  { id: "evolution", label: "Evolution", route: "/agent-studio/evolution", source: "packages/evolution-center", readOnly: true },
  { id: "discovery", label: "Discovery", route: "/agent-studio/discovery", source: "packages/discovery-engine/examples", readOnly: true },
  { id: "memory", label: "Memory", route: "/agent-studio/memory", source: "runtime/global and runtime/projects", readOnly: true }
] as const;
