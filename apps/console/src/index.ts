export { consoleApp, consoleSafety } from "./app.js";
export { consoleActions, getConsoleAction, listConsoleActions, type ConsoleActionDescriptor, type ConsoleActionId, type ConsoleActionScope } from "./actions.js";
export { consoleFixture, type ConsoleFixture } from "./fixtures.js";
export { consoleNavigation, type ConsoleNavigationItem, type ConsolePageId } from "./navigation.js";
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
