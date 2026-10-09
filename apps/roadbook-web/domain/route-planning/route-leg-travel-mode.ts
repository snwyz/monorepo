import type { RouteTravelMode } from "@roadbook/map/web";
import type { ControlPoint, RoutePlan } from "./model";

export const routeTravelModeLabels: Record<RouteTravelMode, string> = {
  driving: "汽车", cycling: "骑行", walking: "步行",
};

export function getRouteLegTravelMode(plan: Pick<RoutePlan, "legTravelModes"> | null, legId: string): RouteTravelMode {
  const mode = plan?.legTravelModes?.[legId];
  return mode === "cycling" || mode === "walking" ? mode : "driving";
}

export function getRouteLegIds(points: ControlPoint[]) {
  return points.length < 2 ? [] : points.map((from, index) => `${from.id}:${points[(index + 1) % points.length].id}`);
}

// 只保存仍相邻的有向连接；缺省与旧方案均为汽车，去返程独立。
export function normalizeRouteLegTravelModes(plan: RoutePlan) {
  const modes: Record<string, RouteTravelMode> = {};
  for (const id of getRouteLegIds(plan.controlPoints)) {
    const mode = getRouteLegTravelMode(plan, id);
    if (mode !== "driving") modes[id] = mode;
  }
  return modes;
}

export function changeRouteLegTravelMode(plan: RoutePlan, legId: string, mode: RouteTravelMode): RoutePlan {
  if (!getRouteLegIds(plan.controlPoints).includes(legId) || getRouteLegTravelMode(plan, legId) === mode) return plan;
  return { ...plan, legTravelModes: normalizeRouteLegTravelModes({ ...plan, legTravelModes: { ...plan.legTravelModes, [legId]: mode } }) };
}

export function inheritInsertedRouteLegTravelMode(plan: RoutePlan, fromId: string, toId: string, point: ControlPoint, points: ControlPoint[]): RoutePlan {
  const mode = getRouteLegTravelMode(plan, `${fromId}:${toId}`);
  const next = { ...plan, controlPoints: points, legTravelModes: { ...plan.legTravelModes,
    [`${fromId}:${point.id}`]: mode, [`${point.id}:${toId}`]: mode,
  } };
  return { ...next, legTravelModes: normalizeRouteLegTravelModes(next) };
}
