import { getConsoleMessages } from "./i18n/index.mjs";

const messages = getConsoleMessages();

export const consoleWebRoutes = [
  { id: "dashboard", label: messages.nav.dashboard, path: "/", navPath: "/" },
  { id: "projects", label: messages.nav.projects, path: "/projects", navPath: "/projects" },
  { id: "runtime", label: messages.nav.runtime, path: "/runtime", navPath: "/runtime" },
  { id: "workers", label: messages.nav.workers, path: "/workers", navPath: "/workers" },
  { id: "credentials", label: messages.nav.credentials, path: "/credentials", navPath: "/credentials" },
  { id: "governance", label: messages.nav.governance, path: "/governance", navPath: "/governance" },
  { id: "planning", label: messages.nav.planning, path: "/planning", navPath: "/planning" },
  { id: "autopilot", label: messages.nav.autopilot, path: "/autopilot", navPath: "/autopilot" },
  { id: "actions", label: messages.nav.actions, path: "/actions", navPath: "/actions" },
  { id: "memory", label: messages.nav.memory, path: "/memory", navPath: "/memory" },
  { id: "pilotStatus", label: messages.nav.pilotStatus, path: "/pilot-status", navPath: "/pilot-status" }
];

export const requiredConsoleWebRouteIds = consoleWebRoutes.map((route) => route.id);
