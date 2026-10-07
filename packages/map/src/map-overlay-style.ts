export const mapOverlayColors = {
  surface: "#ffffff",
  textStrong: "#1c1c1e",
  routeBoundary: "#0a84ff",
  routeCore: "#30d158",
  returnRouteCore: "#1297ff",
  controlPointAccent: "#0a84ff",
  location: "#0a84ff",
  staleRoute: "#8e8e93",
  failedRoute: "#ff3b30",
} as const;

export const plannedRouteStrokeWidths = {
  normal: {
    outline: 14,
    boundary: 11,
    core: 7,
  },
  selected: {
    outline: 16,
    boundary: 13,
    core: 9,
  },
  stale: {
    outline: 9,
    route: 4,
  },
  failed: {
    outline: 9,
    route: 5,
  },
} as const;

// 远景保持原有轻量路线，近景留出固定字号路名的空间。
export function getPlannedRouteStrokeWidths(zoom: number) {
  const progress = Math.max(0, Math.min(1, (zoom - 12) / 2));
  const growth = Math.round(progress * 9);
  return {
    normal: {
      outline: plannedRouteStrokeWidths.normal.outline + growth,
      boundary: plannedRouteStrokeWidths.normal.boundary + growth,
      core: plannedRouteStrokeWidths.normal.core + growth,
    },
    selected: {
      outline: plannedRouteStrokeWidths.selected.outline + growth,
      boundary: plannedRouteStrokeWidths.selected.boundary + growth,
      core: plannedRouteStrokeWidths.selected.core + growth,
    },
    stale: plannedRouteStrokeWidths.stale,
    failed: plannedRouteStrokeWidths.failed,
  };
}
