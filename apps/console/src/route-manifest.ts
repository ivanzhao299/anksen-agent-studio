import { consoleNavigation, type ConsolePageId } from "./navigation.js";
import { getConsoleModuleDetails, getConsolePanel } from "./view-model.js";

export interface ConsoleRouteManifestItem {
  readonly id: ConsolePageId;
  readonly route: string;
  readonly label: string;
  readonly source: string;
  readonly readOnly: true;
  readonly panel_found: boolean;
  readonly details_found: boolean;
}

export interface ConsoleRouteRenderDryRun {
  readonly routes_count: number;
  readonly required_routes: readonly ConsolePageId[];
  readonly missing_routes: readonly ConsolePageId[];
  readonly render_status: "PASS" | "FAIL";
  readonly database: "not_connected";
  readonly external_services: "not_called";
}

export const consoleRenderRequiredRoutes: readonly ConsolePageId[] = [
  "dashboard",
  "projects",
  "runtimeCenter",
  "governance",
  "autopilot",
  "memory"
] as const;

export const consoleRouteManifest: readonly ConsoleRouteManifestItem[] = consoleNavigation.map((item) => ({
  id: item.id,
  route: item.route,
  label: item.label,
  source: item.source,
  readOnly: item.readOnly,
  panel_found: getConsolePanel(item.id) !== null,
  details_found: getConsoleModuleDetails(item.id) !== null
}));

export function renderConsoleRoutesDryRun(): ConsoleRouteRenderDryRun {
  const missingRoutes = consoleRenderRequiredRoutes.filter((id) => {
    const route = consoleRouteManifest.find((item) => item.id === id);
    return !route || !route.panel_found || !route.details_found;
  });

  return {
    routes_count: consoleRouteManifest.length,
    required_routes: consoleRenderRequiredRoutes,
    missing_routes: missingRoutes,
    render_status: missingRoutes.length === 0 ? "PASS" : "FAIL",
    database: "not_connected",
    external_services: "not_called"
  };
}
