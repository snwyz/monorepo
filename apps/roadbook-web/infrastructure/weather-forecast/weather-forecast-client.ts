import type {
  WeatherForecast,
  WeatherForecastTarget,
} from "@/domain/weather-forecast/model";

const CLIENT_CACHE_DURATION_MS = 30 * 60 * 1_000;
const CLIENT_CACHE_LIMIT = 16;

interface CachedForecast {
  expiresAt: number;
  value: WeatherForecast;
}

const forecastCache = new Map<string, CachedForecast>();

function createCacheKey(target: WeatherForecastTarget) {
  return `${target.latitude.toFixed(4)},${target.longitude.toFixed(4)}`;
}

function isWeatherForecast(value: unknown): value is WeatherForecast {
  if (!value || typeof value !== "object") return false;
  const forecast = value as Partial<WeatherForecast>;
  return forecast.source === "tencent"
    && typeof forecast.locationName === "string"
    && typeof forecast.updatedAt === "string"
    && Array.isArray(forecast.days);
}

function cacheForecast(key: string, value: WeatherForecast) {
  if (forecastCache.size >= CLIENT_CACHE_LIMIT) {
    const oldestKey = forecastCache.keys().next().value;
    if (typeof oldestKey === "string") forecastCache.delete(oldestKey);
  }
  forecastCache.set(key, {
    expiresAt: Date.now() + CLIENT_CACHE_DURATION_MS,
    value,
  });
}

export function readCachedWeatherForecast(target: WeatherForecastTarget) {
  const key = createCacheKey(target);
  const cached = forecastCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    forecastCache.delete(key);
    return null;
  }
  return cached.value;
}

export async function fetchWeatherForecast(
  target: WeatherForecastTarget,
  signal: AbortSignal,
  forceRefresh = false,
) {
  const key = createCacheKey(target);
  if (!forceRefresh) {
    const cached = readCachedWeatherForecast(target);
    if (cached) return cached;
  }
  const params = new URLSearchParams({
    latitude: target.latitude.toFixed(4),
    longitude: target.longitude.toFixed(4),
  });
  const response = await fetch(`/api/weather/forecast?${params}`, {
    cache: forceRefresh ? "reload" : "default",
    headers: { accept: "application/json" },
    signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "message" in payload
      ? String(payload.message)
      : "天气预报暂不可用";
    throw new Error(message);
  }
  if (!isWeatherForecast(payload)) throw new Error("天气预报数据格式异常");
  cacheForecast(key, payload);
  return payload;
}
