import type { ChargingStationDetails } from "@/domain/route-charging/model";

const CACHE_MS = 30_000;
const MAX_CACHED_STATIONS = 128;
const MAX_IN_FLIGHT = 16;
interface CachedDetails { details: ChargingStationDetails; fetchedAt: string; timestamp: number }

export function createTeslaStationDetailsCache(
  load: (sourceSiteId: string) => Promise<ChargingStationDetails>,
  now: () => number = Date.now,
) {
  const cache = new Map<string, CachedDetails>();
  const inFlight = new Map<string, Promise<CachedDetails>>();
  return async (sourceSiteId: string) => {
    const cached = cache.get(sourceSiteId);
    if (cached && now() - cached.timestamp < CACHE_MS) return cached;
    const pending = inFlight.get(sourceSiteId);
    if (pending) return pending;
    if (inFlight.size >= MAX_IN_FLIGHT) throw new Error("超充站详情查询繁忙，请稍后重试");
    const promise = (async () => {
      const details = await load(sourceSiteId);
      const timestamp = now();
      const result = { details, timestamp, fetchedAt: new Date(timestamp).toISOString() };
      cache.delete(sourceSiteId);
      if (cache.size >= MAX_CACHED_STATIONS) cache.delete(cache.keys().next().value!);
      cache.set(sourceSiteId, result);
      return result;
    })().finally(() => { inFlight.delete(sourceSiteId); });
    inFlight.set(sourceSiteId, promise);
    return promise;
  };
}
