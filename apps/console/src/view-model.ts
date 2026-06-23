import { consoleApp, consoleSafety } from "./app.js";
import { consoleFixture } from "./fixtures.js";
import { consoleNavigation, type ConsolePageId } from "./navigation.js";

export interface ConsolePanel {
  readonly id: ConsolePageId;
  readonly title: string;
  readonly route: string;
  readonly source: string;
  readonly readOnly: true;
}

export const consolePanels: readonly ConsolePanel[] = consoleNavigation.map((item) => ({
  id: item.id,
  title: item.label,
  route: item.route,
  source: item.source,
  readOnly: true
}));

export function getConsoleViewModel() {
  return {
    app: consoleApp,
    safety: consoleSafety,
    navigation: consoleNavigation,
    panels: consolePanels,
    fixture: consoleFixture
  } as const;
}
