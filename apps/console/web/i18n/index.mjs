import { enUS } from "./en-US.mjs";
import { zhCN } from "./zh-CN.mjs";

export const defaultConsoleLocale = "zh-CN";

export const consoleMessages = {
  "zh-CN": zhCN,
  "en-US": enUS
};

export function getConsoleMessages(locale = defaultConsoleLocale) {
  return consoleMessages[locale] ?? consoleMessages[defaultConsoleLocale];
}
