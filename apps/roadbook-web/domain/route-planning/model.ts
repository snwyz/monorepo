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
  startPointName?: string;
  lastControlPointName?: string;
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

export const ROUTE_PLAN_CONTROL_POINT_LIMIT = 20;

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

export function insertControlPointIntoRouteLeg(
  controlPoints: ControlPoint[],
  fromControlPointId: string,
  toControlPointId: string,
  controlPoint: ControlPoint,
) {
  if (controlPoints.length >= ROUTE_PLAN_CONTROL_POINT_LIMIT) return null;
  const fromIndex = controlPoints.findIndex((point) => point.id === fromControlPointId);
  if (fromIndex < 0 || controlPoints.length === 0) return null;
  const expectedToIndex = (fromIndex + 1) % controlPoints.length;
  if (controlPoints[expectedToIndex]?.id !== toControlPointId) return null;
  const insertionIndex = fromIndex + 1;
  return [
    ...controlPoints.slice(0, insertionIndex),
    controlPoint,
    ...controlPoints.slice(insertionIndex),
  ];
}

export function formatPlanUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function formatPlanDisplayName(
  plan: Pick<RoutePlan, "name" | "updatedAt"> &
    Partial<Pick<RoutePlanSummary, "startPointName" | "lastControlPointName">>,
) {
  const name = plan.name.trim();
  if (name && name !== "未命名路线") return name;

  const startPointName = plan.startPointName?.trim();
  const lastControlPointName = plan.lastControlPointName?.trim();
  if (startPointName && lastControlPointName && startPointName !== lastControlPointName) {
    return `${startPointName} → ${lastControlPointName}`;
  }
  return startPointName || "未命名路线";
}

export function formatPlanUpdatedTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function getPlanUpdatedDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function formatPlanUpdatedDateHeading(value: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日期未知";

  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const calendarLabel = `${date.getMonth() + 1}月${date.getDate()}日`;

  if (dateStart.getTime() === todayStart.getTime()) return `今天 · ${calendarLabel}`;
  if (dateStart.getTime() === yesterdayStart.getTime()) return `昨天 · ${calendarLabel}`;
  if (date.getFullYear() === now.getFullYear()) return calendarLabel;
  return `${date.getFullYear()}年${calendarLabel}`;
}
