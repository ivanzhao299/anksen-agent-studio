import { getConsoleMessages } from "./i18n/index.mjs";

const messages = getConsoleMessages();

export const consoleWebRoutes = [
  { id: "dashboard", label: messages.nav.dashboard, path: "/", navPath: "/" },
  { id: "cockpit", label: "集团驾驶舱", path: "/cockpit", navPath: "/cockpit" },
  { id: "work", label: "我的工作", path: "/work", navPath: "/work" },
  { id: "strategy", label: "战略执行", path: "/strategy", navPath: "/strategy" },
  { id: "hr", label: "人力资源", path: "/hr", navPath: "/hr" },
  { id: "finance", label: "财务管理", path: "/finance", navPath: "/finance" },
  { id: "growthSales", label: "增长销售", path: "/growth-sales", navPath: "/growth-sales" },
  { id: "manufacturing", label: "制造 ERP", path: "/manufacturing", navPath: "/manufacturing" },
  { id: "smartPark", label: "智慧园区", path: "/smart-park", navPath: "/smart-park" },
  { id: "video", label: "视频工厂", path: "/video", navPath: "/video" },
  { id: "cad", label: "工程 CAD", path: "/cad", navPath: "/cad" },
  { id: "execution", label: "运行", path: "/execution", navPath: "/execution" },
  { id: "development", label: "自主开发", path: "/development", navPath: "/development" },
  { id: "domains", label: "领域中心", path: "/domains", navPath: "/domains" },
  { id: "portfolio", label: "长期任务", path: "/portfolio", navPath: "/portfolio" },
  { id: "outcomes", label: "经营结果", path: "/outcomes", navPath: "/outcomes" },
  { id: "projects", label: messages.nav.projects, path: "/projects", navPath: "/projects" },
  { id: "workers", label: messages.nav.workers, path: "/workers", navPath: "/workers", showInNav: false },
  { id: "actions", label: messages.nav.actions, path: "/actions", navPath: "/actions" },
  { id: "autopilot", label: messages.nav.autopilot, path: "/autopilot", navPath: "/autopilot" },
  { id: "config", label: messages.nav.config, path: "/config", navPath: "/config" },
  { id: "account", label: "账户与安全", path: "/account", navPath: "/account", showInNav: false },
  { id: "runtime", label: messages.nav.runtime, path: "/runtime", navPath: "/runtime", showInNav: false },
  { id: "credentials", label: messages.nav.credentials, path: "/credentials", navPath: "/credentials", showInNav: false },
  { id: "governance", label: messages.nav.governance, path: "/governance", navPath: "/governance", showInNav: false },
  { id: "planning", label: messages.nav.planning, path: "/planning", navPath: "/planning", showInNav: false },
  { id: "memory", label: messages.nav.memory, path: "/memory", navPath: "/memory", showInNav: false },
  { id: "pilotStatus", label: messages.nav.pilotStatus, path: "/pilot-status", navPath: "/pilot-status", showInNav: false }
];

export const requiredConsoleWebRouteIds = consoleWebRoutes.map((route) => route.id);
