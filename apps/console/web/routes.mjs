export const consoleWebRoutes = [
  { id: "dashboard", label: "Dashboard", path: "/", navPath: "/" },
  { id: "projects", label: "Projects", path: "/projects", navPath: "/projects" },
  { id: "runtime", label: "Runtime", path: "/runtime", navPath: "/runtime" },
  { id: "workers", label: "Workers", path: "/workers", navPath: "/workers" },
  { id: "credentials", label: "Credentials", path: "/credentials", navPath: "/credentials" },
  { id: "governance", label: "Governance", path: "/governance", navPath: "/governance" },
  { id: "planning", label: "Planning", path: "/planning", navPath: "/planning" },
  { id: "autopilot", label: "Autopilot", path: "/autopilot", navPath: "/autopilot" },
  { id: "actions", label: "Console Actions", path: "/actions", navPath: "/actions" },
  { id: "memory", label: "Memory", path: "/memory", navPath: "/memory" },
  { id: "pilotStatus", label: "Pilot Status", path: "/pilot-status", navPath: "/pilot-status" }
];

export const requiredConsoleWebRouteIds = consoleWebRoutes.map((route) => route.id);
