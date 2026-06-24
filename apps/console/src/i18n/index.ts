import { enUS } from "./en-US.js";
import { zhCN } from "./zh-CN.js";
export type { ConsoleMessages } from "./types.js";

export const defaultConsoleLocale = "zh-CN";

export const consoleMessages = {
  "zh-CN": zhCN,
  "en-US": enUS
} as const;

export type ConsoleLocale = keyof typeof consoleMessages;

export function getConsoleMessages(locale: ConsoleLocale = defaultConsoleLocale) {
  return consoleMessages[locale] ?? consoleMessages[defaultConsoleLocale];
}
