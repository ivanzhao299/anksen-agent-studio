import { consoleApp, consoleSafety } from "./app.js";
import { consoleActions } from "./actions.js";
import { consoleFixture } from "./fixtures.js";
import { consoleNavigation, type ConsolePageId } from "./navigation.js";

export type ConsoleModuleSummary = (typeof consoleFixture.modules)[number];
export type ConsoleMetric = ConsoleModuleSummary["metrics"][number];
export type ConsoleModuleStatus = ConsoleModuleSummary["status"] | "unknown";
export type ConsoleRiskLevel = ConsoleModuleSummary["risk"] | "UNKNOWN";

export interface ConsolePanel {
  readonly id: ConsolePageId;
  readonly title: string;
  readonly route: string;
  readonly source: string;
  readonly readOnly: true;
  readonly status: ConsoleModuleStatus;
  readonly risk: ConsoleRiskLevel;
  readonly summary: string;
  readonly metrics: readonly ConsoleMetric[];
}

export interface ConsoleReadOnlySummary {
  readonly module_count: number;
  readonly operable_action_count: number;
  readonly ready_module_count: number;
  readonly high_risk_module_count: number;
  readonly managed_project_writes: typeof consoleSafety.managed_project_writes;
  readonly deploy: typeof consoleSafety.deploy;
  readonly production_operations: typeof consoleSafety.production_operations;
  readonly credential_values: typeof consoleSafety.credential_values;
}

function moduleForPage(id: ConsolePageId): ConsoleModuleSummary | undefined {
  return consoleFixture.modules.find((module) => module.id === id);
}

export const consolePanels: readonly ConsolePanel[] = consoleNavigation.map((item) => {
  const module = moduleForPage(item.id);
  return {
    id: item.id,
    title: item.label,
    route: item.route,
    source: item.source,
    readOnly: item.readOnly,
    status: module?.status ?? "unknown",
    risk: module?.risk ?? "UNKNOWN",
    summary: module?.summary ?? "No read-only fixture summary is available for this panel.",
    metrics: module?.metrics ?? []
  };
});

export const consoleReadOnlySummary: ConsoleReadOnlySummary = {
  module_count: consoleFixture.modules.length,
  operable_action_count: consoleActions.length,
  ready_module_count: consoleFixture.modules.filter((module) => module.status === "ready").length,
  high_risk_module_count: consoleFixture.modules.filter((module) => module.risk === "HIGH").length,
  managed_project_writes: consoleSafety.managed_project_writes,
  deploy: consoleSafety.deploy,
  production_operations: consoleSafety.production_operations,
  credential_values: consoleSafety.credential_values
};

export function getConsolePanel(id: ConsolePageId) {
  return consolePanels.find((panel) => panel.id === id) ?? null;
}

export function getConsoleModuleDetails(id: ConsolePageId) {
  if (id === "dashboard") return consoleFixture.dashboard;
  if (id === "projects") return consoleFixture.projects;
  if (id === "projectConnector") return consoleFixture.project_connector;
  if (id === "runtimeCenter") return consoleFixture.runtime_center;
  if (id === "runtimeAdapters") return consoleFixture.runtime_adapters;
  if (id === "credentialVault") return consoleFixture.credential_vault;
  if (id === "governance") return consoleFixture.governance;
  if (id === "planning") return consoleFixture.planning;
  if (id === "autopilot") return consoleFixture.autopilot;
  if (id === "memory") return consoleFixture.memory_context;
  return consoleFixture.evolution_discovery;
}

export function getConsoleViewModel() {
  return {
    app: consoleApp,
    safety: consoleSafety,
    summary: consoleReadOnlySummary,
    navigation: consoleNavigation,
    panels: consolePanels,
    actions: consoleActions,
    fixture: consoleFixture,
    details: {
      dashboard: consoleFixture.dashboard,
      projects: consoleFixture.projects,
      project_connector: consoleFixture.project_connector,
      runtime_center: consoleFixture.runtime_center,
      runtime_adapters: consoleFixture.runtime_adapters,
      credential_vault: consoleFixture.credential_vault,
      governance: consoleFixture.governance,
      planning: consoleFixture.planning,
      production_ops: consoleFixture.production_ops,
      autopilot: consoleFixture.autopilot,
      memory_context: consoleFixture.memory_context,
      evolution_discovery: consoleFixture.evolution_discovery
    }
  } as const;
}
