import type { DrivingStrategy, MapCoordinate } from "@roadbook/map/web";

export interface ControlPoint extends MapCoordinate {
  id: string;
  name: string;
  address: string;
}

export interface RoutePlan {
  id: string;
  name: string;
  strategy: DrivingStrategy;
  controlPoints: ControlPoint[];
  revision: number;
  updatedAt: string;
  schemaVersion: 1;
}

export interface RoutePlanSummary {
  id: string;
  name: string;
  controlPointCount: number;
  updatedAt: string;
  schemaVersion: 1;
  loadable: boolean;
}

export type RouteCalculationStatus =
  | "idle"
  | "waiting-for-points"
  | "updating"
  | "ready"
  | "failed";

export type DraftStatus = "idle" | "saving" | "saved" | "failed";

export function createRoutePlan(id: string, now = new Date()): RoutePlan {
  return {
    id,
    name: "未命名路线",
    strategy: "recommend",
    controlPoints: [],
    revision: 0,
    updatedAt: now.toISOString(),
    schemaVersion: 1,
  };
}

export function reviseRoutePlan(
  plan: RoutePlan,
  change: (draft: RoutePlan) => RoutePlan,
): RoutePlan {
  const next = change(plan);
  return {
    ...next,
    revision: plan.revision + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function formatPlanUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
