import { zhCN } from "./zh-CN.js";
import type { ConsoleMessages } from "./types.js";

export const enUS = {
  ...zhCN,
  locale: "en-US",
  localeName: "English placeholder"
} as const satisfies ConsoleMessages;
