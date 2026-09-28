import type { ChargingStation } from "@/domain/route-charging/model";

const FRESH_MS = 6 * 60 * 60 * 1000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 60 * 1000;

export function createChargingStationCache(
  load: () => Promise<ChargingStation[]>,
  now: () => number = Date.now,
) {
  let snapshot: { stations: ChargingStation[]; fetchedAt: string; timestamp: number } | null = null;
  let inFlight: Promise<void> | null = null;
  let retryAfter = 0;

  return async () => {
    if (!snapshot || now() - snapshot.timestamp >= FRESH_MS) {
      if (!inFlight && now() >= retryAfter) {
        inFlight = (async () => {
          try {
            const stations = await load();
            if (stations.length === 0) throw new Error("超充站目录为空");
            const timestamp = now();
            snapshot = { stations, timestamp, fetchedAt: new Date(timestamp).toISOString() };
            retryAfter = 0;
          } catch {
            retryAfter = now() + RETRY_MS;
          }
        })().finally(() => { inFlight = null; });
      }
      if (inFlight) await inFlight;
    }
    if (!snapshot || now() - snapshot.timestamp >= MAX_AGE_MS) {
      throw new Error("特斯拉超充站暂不可用，请稍后重试");
    }
    return {
      stations: snapshot.stations,
      fetchedAt: snapshot.fetchedAt,
      stale: now() - snapshot.timestamp >= FRESH_MS,
    };
  };
}
