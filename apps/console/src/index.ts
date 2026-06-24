export { consoleApp, consoleSafety } from "./app.js";
export {
  buildConsoleActionPlan,
  consoleActionCenter,
  consoleActions,
  getConsoleAction,
  listConsoleActions,
  type ConsoleActionDescriptor,
  type ConsoleActionId,
  type ConsoleActionMode,
  type ConsoleActionPlan,
  type ConsoleActionRisk,
  type ConsoleActionScope,
  type ConsoleExecutionMode,
  type ConsoleGovernanceGate
} from "./actions.js";
export { consoleFixture, type ConsoleFixture } from "./fixtures.js";
export { consoleNavigation, type ConsoleNavigationItem, type ConsolePageId } from "./navigation.js";
export {
  consoleRenderRequiredRoutes,
  consoleRouteManifest,
  renderConsoleRoutesDryRun,
  type ConsoleRouteManifestItem,
  type ConsoleRouteRenderDryRun
} from "./route-manifest.js";
export {
  consoleV5BatchEntries,
  consoleV5BatchSafety,
  consoleV5CompletionSummary,
  consoleV5RecentRunHistory,
  consoleV5RemainingGaps,
  consoleV5StageCompletion,
  type ConsoleV5RoadmapEntry,
  type ConsoleV5RunHistoryEntry,
  type ConsoleV5StageCompletion
} from "./v5-roadmap.js";
export {
  consoleMessages,
  defaultConsoleLocale,
  getConsoleMessages,
  type ConsoleLocale
} from "./i18n/index.js";
export {
  consolePanels,
  consoleReadOnlySummary,
  getConsoleModuleDetails,
  getConsolePanel,
  getConsoleViewModel,
  type ConsoleMetric,
  type ConsoleModuleStatus,
  type ConsoleModuleSummary,
  type ConsolePanel,
  type ConsoleReadOnlySummary,
  type ConsoleRiskLevel
} from "./view-model.js";
