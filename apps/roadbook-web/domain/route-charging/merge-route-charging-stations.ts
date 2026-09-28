import type { RouteChargingCandidate, RouteChargingResult, WholeRouteChargingResult } from "./model";

interface ChargingLegResult {
  fromControlPointId: string;
  toControlPointId: string;
  result: RouteChargingResult;
}

/** 输入保持行驶顺序；重叠道路优先最近路段，等距时取首次经过。 */
export function mergeRouteChargingStations(legs: readonly ChargingLegResult[]): WholeRouteChargingResult {
  const stations = new Map<string, RouteChargingCandidate>();
  for (const leg of legs) {
    for (const station of leg.result.stations) {
      const previous = stations.get(station.id);
      if (previous && previous.distanceFromRouteMeters <= station.distanceFromRouteMeters) continue;
      stations.set(station.id, { ...station,
        fromControlPointId: leg.fromControlPointId, toControlPointId: leg.toControlPointId,
      });
    }
  }
  return {
    source: "tesla",
    fetchedAt: legs.map((leg) => leg.result.fetchedAt).sort()[0] ?? new Date().toISOString(),
    stale: legs.some((leg) => leg.result.stale),
    radiusMeters: legs[0]?.result.radiusMeters ?? 2000,
    stations: [...stations.values()],
  };
}
