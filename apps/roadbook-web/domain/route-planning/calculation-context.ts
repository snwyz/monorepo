import type { DrivingRoute, WebMapProvider } from "@roadbook/map/web";
import type { RoutePlan } from "./model";

// 保存修订包含元数据；算路身份只包含实际参与计算的输入。
export function routeCalculationIdentity(plan: RoutePlan | null, provider: WebMapProvider) {
  return JSON.stringify([
    plan?.id ?? null,
    provider,
    plan?.strategy ?? null,
    plan?.controlPoints.map(({ id, latitude, longitude }) => [id, latitude, longitude]) ?? [],
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
