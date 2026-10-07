import { analyzeProfile } from "./analyze-profile";
import { ELEVATION_POLICY, ELEVATION_SOURCE, type ElevationGeometry, type ElevationProfile, type ElevationProvider, type ElevationSample } from "../../domain/elevation-analysis/model";

const rawCache = new Map<string, { samples: ElevationSample[]; expires: number }>();
const analysisCache = new Map<string, ElevationProfile>();
const TTL = 6 * 60 * 60 * 1000;
export async function loadElevationProfile(geometry: ElevationGeometry, provider: ElevationProvider, signal: AbortSignal, onProgress: (completed: number, total: number) => void, force = false) {
  const rawKey = `${ELEVATION_SOURCE.version}:${geometry.samplingVersion}:${geometry.sampleSpacingMeters}:${geometry.signature}`;
  const analysisKey = `${JSON.stringify(ELEVATION_POLICY)}:${rawKey}`;
  const cached = rawCache.get(rawKey);
  if (!force && cached && cached.expires > Date.now()) {
    const profile = analysisCache.get(analysisKey) ?? await analyzeProfile(cached.samples, signal);
    analysisCache.set(analysisKey, profile);
    return { profile, warning: null };
  }
  const samples = geometry.samples.map((sample) => ({ ...sample }));
  const total = Math.ceil(samples.length / 100);
  let warning: string | null = null;
  for (let offset = 0; offset < samples.length; offset += 100) {
    signal.throwIfAborted();
    try {
      const batch = await provider.query(samples.slice(offset, offset + 100).map((sample) => sample.coordinate), signal);
      signal.throwIfAborted();
      if (batch.sourceVersion !== ELEVATION_SOURCE.version || batch.elevations.length !== Math.min(100, samples.length - offset)) throw new Error("高程来源版本或数量不一致");
      batch.elevations.forEach((height, index) => {
        const sample = samples[offset + index];
        sample.rawElevationMeters = height; sample.elevationMeters = height;
        sample.quality = height === null ? "missing" : "surface-estimate";
      });
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
    rawCache.set(rawKey, { samples, expires: Date.now() + TTL });
    analysisCache.set(analysisKey, profile);
    while (rawCache.size > 4) {
      const oldest = rawCache.keys().next().value!;
      rawCache.delete(oldest);
      for (const key of analysisCache.keys()) if (key.endsWith(oldest)) analysisCache.delete(key);
    }
  }
  return { profile, warning };
}
