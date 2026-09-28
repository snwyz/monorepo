export const mapOverlayColors = {
  surface: "#ffffff",
  textStrong: "#1c1c1e",
  routeBoundary: "#0a84ff",
  routeCore: "#30d158",
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
