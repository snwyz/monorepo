import "server-only";

import { unstable_cache } from "next/cache";

import type {
  DailyWeatherForecast,
  WeatherForecast,
  WeatherSymbolName,
} from "@/domain/weather-forecast/model";
import { requestTencentMapWebService } from "@/lib/tencent-map/tencent-map-web-service";

const FORECAST_DAY_COUNT = 7;
const FORECAST_CACHE_SECONDS = 30 * 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) ? result : null;
}

function resolveWeatherSymbol(condition: string): WeatherSymbolName {
  if (/雷|电/.test(condition)) return "thunderstorm";
  if (/雪|冰雹|冻雨/.test(condition)) return "snowy";
  if (/暴雨|大雨/.test(condition)) return "heavy-rain";
  if (/雨/.test(condition)) return "light-rain";
  if (/雾|霾/.test(condition)) return "foggy";
  if (/沙|尘|风/.test(condition)) return "windy";
  if (/阴/.test(condition)) return "overcast";
  if (/多云|少云/.test(condition)) return "partly-cloudy";
  if (/晴/.test(condition)) return "sunny";
  return "overcast";
}

function parseDailyForecast(value: unknown): DailyWeatherForecast | null {
  if (!isRecord(value) || !isRecord(value.day) || !isRecord(value.night)) return null;
  const date = readString(value.date);
  const dayCondition = readString(value.day.weather);
  const nightCondition = readString(value.night.weather);
  const dayTemperature = readNumber(value.day.temperature);
  const nightTemperature = readNumber(value.night.temperature);
  if (!date || !dayCondition || dayTemperature === null || nightTemperature === null) {
    return null;
  }
  const condition = nightCondition && nightCondition !== dayCondition
    ? `${dayCondition}转${nightCondition}`
    : dayCondition;
  return {
    date,
    condition,
    symbol: resolveWeatherSymbol(condition),
    highTemperatureCelsius: Math.max(dayTemperature, nightTemperature),
    lowTemperatureCelsius: Math.min(dayTemperature, nightTemperature),
  };
}

async function requestTencentWeatherForecast(
  latitude: string,
  longitude: string,
): Promise<WeatherForecast> {
  const result = await requestTencentMapWebService("/ws/weather/v1/", {
    get_md: "1",
    location: `${latitude},${longitude}`,
    type: "future",
  });
  if (!result.ok || !isRecord(result.data)) {
    throw new Error("腾讯天气服务暂不可用");
  }
  const status = readNumber(result.data.status);
  if (status !== 0) {
    const message = readString(result.data.message);
    throw new Error(message || "腾讯天气服务返回异常");
  }
  const payload = isRecord(result.data.result) ? result.data.result : null;
  const forecasts = payload && Array.isArray(payload.forecast)
    ? payload.forecast
    : [];
  const forecast = forecasts.find(isRecord);
  if (!forecast) throw new Error("腾讯天气服务未返回预报数据");

  const days = Array.isArray(forecast.infos)
    ? forecast.infos
      .map(parseDailyForecast)
      .filter((item): item is DailyWeatherForecast => Boolean(item))
      .slice(0, FORECAST_DAY_COUNT)
    : [];
  if (days.length === 0) throw new Error("所选地点暂无天气预报");

  return {
    locationName:
      readString(forecast.district)
      || readString(forecast.city)
      || readString(forecast.province)
      || "所选地点",
    updatedAt: readString(forecast.update_time),
    source: "tencent",
    days,
  };
}

export const getTencentWeatherForecast = unstable_cache(
  requestTencentWeatherForecast,
  ["tencent-weather-forecast-v1"],
  { revalidate: FORECAST_CACHE_SECONDS },
);
