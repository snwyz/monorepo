import type { DrivingRouteLeg } from "@roadbook/map/web";
import { mergeRouteChargingStations } from "@/domain/route-charging/merge-route-charging-stations";
import type { ChargingCoordinate, ChargingStationDetailsResult, RouteChargingResult } from "@/domain/route-charging/model";

const routeCache = new WeakMap<ChargingCoordinate[], { result: RouteChargingResult; expiresAt: number }>();
const routeRequests = new WeakMap<ChargingCoordinate[], Promise<RouteChargingResult>>();
const detailsCache = new Map<string, ChargingStationDetailsResult>();
const detailRequests = new Map<string, Promise<ChargingStationDetailsResult>>();

/** 离开详情仅取消当前订阅，不取消共享请求，快速重复点击可复用在途结果。 */
function subscribe<T>(request: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    request.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}

export async function queryRouteChargingStations(path: ChargingCoordinate[], signal: AbortSignal): Promise<RouteChargingResult> {
  signal.throwIfAborted();
  const cached = routeCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  let pending = routeRequests.get(path);
  if (!pending) {
    pending = (async () => {
      const response = await fetch("/api/route-charging/tesla", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }), signal: AbortSignal.timeout(20_000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "沿途超充站暂不可用");
      if (result.source !== "tesla" || !Array.isArray(result.stations)) throw new Error("站点列表格式异常");
      routeCache.set(path, { result, expiresAt: Date.now() + (result.stale ? 60_000 : 300_000) });
      return result as RouteChargingResult;
    })().finally(() => routeRequests.delete(path));
    routeRequests.set(path, pending);
  }
  return subscribe(pending, signal);
}

export function getCachedChargingStationDetails(stationId: string) {
  return detailsCache.get(stationId) ?? null;
}

export async function queryChargingStationDetails(stationId: string, signal: AbortSignal, force = false): Promise<ChargingStationDetailsResult> {
  signal.throwIfAborted();
  const cached = detailsCache.get(stationId);
  if (!force && cached && Date.parse(cached.fetchedAt) + 30_000 > Date.now()) return cached;
  let pending = detailRequests.get(stationId);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(`/api/route-charging/tesla/${encodeURIComponent(stationId)}`, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "站点详情暂不可用");
      if (result.stationId !== stationId || !result.details) throw new Error("站点详情不匹配");
      detailsCache.delete(stationId);
      detailsCache.set(stationId, result);
      if (detailsCache.size > 100) detailsCache.delete(detailsCache.keys().next().value!);
      return result as ChargingStationDetailsResult;
    })().finally(() => detailRequests.delete(stationId));
    detailRequests.set(stationId, pending);
  }
  return subscribe(pending, signal);
}

/** 路段仅作为传输分片，限制并发并保留全部道路几何，避免跨路段虚假连线。 */
export async function queryWholeRouteChargingStations(legs: readonly DrivingRouteLeg[], signal: AbortSignal) {
  const results: { fromControlPointId: string; toControlPointId: string; result: RouteChargingResult }[] = [];
  for (let index = 0; index < legs.length; index += 3) {
    signal.throwIfAborted();
    const batch = await Promise.all(legs.slice(index, index + 3).map(async (leg) => ({
      fromControlPointId: leg.fromControlPointId, toControlPointId: leg.toControlPointId,
      result: await queryRouteChargingStations(leg.path, signal),
    })));
    results.push(...batch);
  }
  return mergeRouteChargingStations(results);
}
