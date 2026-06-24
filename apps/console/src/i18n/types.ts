export interface ConsoleMessages {
  readonly locale: "zh-CN" | "en-US";
  readonly localeName: string;
  readonly app: {
    readonly title: string;
    readonly subtitle: string;
  };
  readonly nav: Record<
    | "dashboard"
    | "projects"
    | "runtime"
    | "workers"
    | "credentials"
    | "governance"
    | "planning"
    | "autopilot"
    | "actions"
    | "memory"
    | "pilotStatus",
    string
  >;
  readonly common: Record<
    | "file"
    | "keys"
    | "status"
    | "risk"
    | "mode"
    | "gate"
    | "safety"
    | "dataSources"
    | "loaded"
    | "notFound"
    | "unknown"
    | "disabled"
    | "notRead"
    | "falseValue"
    | "noExternalCalls",
    string
  >;
  readonly pages: Record<string, Record<string, string>>;
}
