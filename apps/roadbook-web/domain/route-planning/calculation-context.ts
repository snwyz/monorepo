import type { DrivingRoute, WebMapProvider } from "@roadbook/map/web";
import type { RoutePlan } from "./model";
import { getRouteLegIds, getRouteLegTravelMode } from "./route-leg-travel-mode";

// 保存修订包含元数据；算路身份只包含实际参与计算的输入。
export function routeCalculationIdentity(plan: RoutePlan | null, provider: WebMapProvider) {
  return JSON.stringify([
    plan?.id ?? null,
    provider,
    plan?.strategy ?? null,
    plan?.controlPoints.map(({ id, latitude, longitude }) => [id, latitude, longitude]) ?? [],
    // 默认汽车保持旧身份格式，旧方案缩略数据可继续复用。
    ...(plan && getRouteLegIds(plan.controlPoints).some((id) => getRouteLegTravelMode(plan, id) !== "driving")
      ? [getRouteLegIds(plan.controlPoints).map((id) => [id, getRouteLegTravelMode(plan, id)])] : []),
  ]);
}

export interface PublishedRouteContext {
  planId: string;
  revision: number;
  sourceRevision: number;
  inputIdentity: string;
  mapProvider: WebMapProvider;
  requestBatch: number;
  route: DrivingRoute;
}
