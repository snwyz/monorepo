import { analyzeProfile } from "./analyze-profile";
import { ELEVATION_POLICY, ELEVATION_SOURCE, type ElevationGeometry, type ElevationProfile, type ElevationProvider, type ElevationSample } from "../../domain/elevation-analysis/model";

interface ElevationCache {
  raw: Map<string, { samples: ElevationSample[]; expires: number }>;
  analysis: Map<string, ElevationProfile>;
  coordinates: Map<string, { elevation: number | null; expires: number }>;
}
// 高程来源实例隔离缓存，位置读数可复用，经过顺序与坡段分析不能按坐标去重。
const caches = new WeakMap<ElevationProvider, ElevationCache>();
const TTL = 6 * 60 * 60 * 1000;
function cacheFor(provider: ElevationProvider): ElevationCache {
  let cache = caches.get(provider);
  if (!cache) {
    cache = { raw: new Map(), analysis: new Map(), coordinates: new Map() };
    caches.set(provider, cache);
  }
  return cache;
}
function rawKeyFor(geometry: ElevationGeometry) {
  return `${ELEVATION_SOURCE.version}:${geometry.samplingVersion}:${geometry.sampleSpacingMeters}:${geometry.signature}`;
}
function analysisKeyFor(rawKey: string) { return `${JSON.stringify(ELEVATION_POLICY)}:${rawKey}`; }
function coordinateKeyFor(sample: ElevationSample) {
  return `${ELEVATION_SOURCE.version}:${sample.coordinate.latitude},${sample.coordinate.longitude}`;
}
function applyElevation(sample: ElevationSample, height: number | null) {
  sample.rawElevationMeters = height;
  sample.elevationMeters = height;
  sample.quality = height === null ? "missing" : "surface-estimate";
}
export function getCachedElevationProfile(geometry: ElevationGeometry, provider: ElevationProvider): ElevationProfile | null {
  const cache = caches.get(provider);
  const rawKey = rawKeyFor(geometry);
  const cached = cache?.raw.get(rawKey);
  return cached && cached.expires > Date.now() ? cache!.analysis.get(analysisKeyFor(rawKey)) ?? null : null;
}
export async function loadElevationProfile(geometry: ElevationGeometry, provider: ElevationProvider, signal: AbortSignal, onProgress: (completed: number, total: number) => void, force = false) {
  signal.throwIfAborted();
  const cache = cacheFor(provider);
  const rawKey = rawKeyFor(geometry);
  const analysisKey = analysisKeyFor(rawKey);
  const cached = cache.raw.get(rawKey);
  if (!force && cached && cached.expires > Date.now()) {
    const profile = cache.analysis.get(analysisKey) ?? await analyzeProfile(cached.samples, signal);
    signal.throwIfAborted();
    cache.analysis.set(analysisKey, profile);
    return { profile, warning: null };
  }
  if (force) {
    // 主动重试绕过旧读数，并使依赖这些读数的完整分析失效。
    cache.raw.clear(); cache.analysis.clear();
    for (const sample of geometry.samples) cache.coordinates.delete(coordinateKeyFor(sample));
  }
  const samples = geometry.samples.map((sample) => ({ ...sample }));
  const now = Date.now();
  let expires = now + TTL;
  const missing = new Map<string, ElevationSample[]>();
  for (const sample of samples) {
    const key = coordinateKeyFor(sample);
    const reading = cache.coordinates.get(key);
    if (reading && reading.expires > now) {
      applyElevation(sample, reading.elevation);
      expires = Math.min(expires, reading.expires);
    } else {
      cache.coordinates.delete(key);
      const occurrences = missing.get(key);
      if (occurrences) occurrences.push(sample);
      else missing.set(key, [sample]);
    }
  }
  const pending = Array.from(missing.entries());
  const total = Math.ceil(pending.length / 100);
  onProgress(0, total);
  let warning: string | null = null;
  for (let offset = 0; offset < pending.length; offset += 100) {
    signal.throwIfAborted();
    try {
      const entries = pending.slice(offset, offset + 100);
      const batch = await provider.query(entries.map(([, occurrences]) => occurrences[0].coordinate), signal);
      signal.throwIfAborted();
      if (batch.sourceVersion !== ELEVATION_SOURCE.version || batch.elevations.length !== entries.length || batch.elevations.some((height) => height !== null && !Number.isFinite(height))) throw new Error("高程来源版本、数量或读数无效");
      batch.elevations.forEach((height, index) => {
        const [key, occurrences] = entries[index];
        for (const sample of occurrences) applyElevation(sample, height);
        cache.coordinates.set(key, { elevation: height, expires: Date.now() + TTL });
      });
      while (cache.coordinates.size > 30000) cache.coordinates.delete(cache.coordinates.keys().next().value!);
      onProgress(Math.min(total, Math.floor(offset / 100) + 1), total);
    } catch (error) {
      signal.throwIfAborted();
      warning = error instanceof Error ? error.message : "部分高程查询失败";
      break;
    }
  }
  if (!samples.some((sample) => sample.quality === "surface-estimate")) throw new Error(warning ?? "当前路线没有可用高程数据");
  const profile = await analyzeProfile(samples, signal);
  signal.throwIfAborted();
  if (!warning) {
    cache.raw.set(rawKey, { samples, expires });
    cache.analysis.set(analysisKey, profile);
    while (cache.raw.size > 4) {
      const oldest = cache.raw.keys().next().value!;
      cache.raw.delete(oldest);
      cache.analysis.delete(analysisKeyFor(oldest));
    }
  }
  return { profile, warning };
}
