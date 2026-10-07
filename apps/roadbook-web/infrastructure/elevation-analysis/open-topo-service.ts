import type { MapCoordinate } from "@roadbook/map/web";
import { ELEVATION_SOURCE, type ElevationBatch } from "../../domain/elevation-analysis/model";
import { gcj02ToWgs84 } from "./coordinate-transform";

export class ElevationServiceError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}
const TTL = 24 * 60 * 60 * 1000;
const cache = new Map<string, { elevation: number | null; expires: number }>();
let queue: Promise<void> = Promise.resolve();
let queued = 0;
let lastRequest = 0;
let day = ""; let calls = 0;

export function parseElevationBatch(payload: unknown, coordinates: MapCoordinate[]): ElevationBatch {
  const data = payload as { status?: string; results?: Array<{ elevation?: unknown; dataset?: string; location?: { lat?: number; lng?: number } }> };
  if (data?.status !== "OK" || !Array.isArray(data.results) || data.results.length !== coordinates.length) throw new ElevationServiceError("高程服务返回不完整，请稍后重试");
  const elevations = data.results.map((item, index) => {
    const expected = coordinates[index];
    if (!item || item.dataset !== "srtm30m" || !item.location || typeof item.location.lat !== "number" || !Number.isFinite(item.location.lat) || typeof item.location.lng !== "number" || !Number.isFinite(item.location.lng) || Math.abs(item.location.lat - expected.latitude) > 0.00002 || Math.abs(item.location.lng - expected.longitude) > 0.00002) throw new ElevationServiceError("高程数据位置校验失败");
    if (item.elevation === null) return null;
    if (typeof item.elevation !== "number" || !Number.isFinite(item.elevation) || item.elevation < -12000 || item.elevation > 9000) throw new ElevationServiceError("高程数据格式无效");
    return item.elevation;
  });
  return { elevations, sourceVersion: ELEVATION_SOURCE.version };
}

// 公共服务试验接入：单进程串行限流、队列和预算有界；多实例须先使用共享限流器。
export async function queryOpenTopoElevation(mapCoordinates: MapCoordinate[], signal: AbortSignal): Promise<ElevationBatch> {
  if (queued >= 12) throw new ElevationServiceError("高程查询繁忙，请稍后重试", 429);
  queued++;
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>((resolve) => { release = resolve; });
  try {
    await previous;
    signal.throwIfAborted();
    const coordinates = mapCoordinates.map(gcj02ToWgs84).map((point) => ({ latitude: Number(point.latitude.toFixed(6)), longitude: Number(point.longitude.toFixed(6)) }));
    const keys = coordinates.map((point) => `${point.latitude},${point.longitude}`);
    const missing = [...new Set(keys.filter((key) => !cache.has(key) || cache.get(key)!.expires <= Date.now()))];
    if (missing.length) {
      const today = new Date().toISOString().slice(0, 10);
      if (day !== today) { day = today; calls = 0; }
      if (calls >= 950) throw new ElevationServiceError("今日试验高程查询额度已用完", 429);
      const wait = Math.max(0, lastRequest + 1100 - Date.now());
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      signal.throwIfAborted();
      lastRequest = Date.now(); calls++;
      const queryPoints = missing.map((key) => { const [latitude, longitude] = key.split(",").map(Number); return { latitude, longitude }; });
      const response = await fetch("https://api.opentopodata.org/v1/srtm30m", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locations: missing.join("|"), interpolation: "bilinear", nodata_value: "null" }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), cache: "no-store",
      });
      if (!response.ok) throw new ElevationServiceError(response.status === 429 ? "高程服务限流，请稍后重试" : "高程服务暂不可用", response.status === 429 ? 429 : 502);
      const batch = parseElevationBatch(await response.json(), queryPoints);
      missing.forEach((key, index) => cache.set(key, { elevation: batch.elevations[index], expires: Date.now() + TTL }));
      while (cache.size > 30000) cache.delete(cache.keys().next().value!);
    }
    return { elevations: keys.map((key) => cache.get(key)!.elevation), sourceVersion: ELEVATION_SOURCE.version };
  } catch (error) {
    if (error instanceof ElevationServiceError) throw error;
    throw new ElevationServiceError(signal.aborted ? "高程查询已取消" : "高程服务连接失败或超时，请稍后重试");
  } finally { queued--; release(); }
}
