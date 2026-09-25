import { type NextRequest, NextResponse } from "next/server";

import { getTencentWeatherForecast } from "@/infrastructure/weather-forecast/tencent-weather-forecast-service";

export const runtime = "nodejs";

const RESPONSE_CACHE_SECONDS = 30 * 60;

function readCoordinate(value: string | null, min: number, max: number) {
  if (!value || !/^-?\d+(?:\.\d+)?$/.test(value)) return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max
    ? coordinate.toFixed(4)
    : null;
}

export async function GET(request: NextRequest) {
  const latitude = readCoordinate(
    request.nextUrl.searchParams.get("latitude"),
    -90,
    90,
  );
  const longitude = readCoordinate(
    request.nextUrl.searchParams.get("longitude"),
    -180,
    180,
  );
  if (!latitude || !longitude) {
    return NextResponse.json(
      { message: "天气查询坐标无效" },
      { status: 400 },
    );
  }
  try {
    const forecast = await getTencentWeatherForecast(latitude, longitude);
    return NextResponse.json(forecast, {
      headers: {
        "Cache-Control": `public, max-age=300, s-maxage=${RESPONSE_CACHE_SECONDS}, stale-while-revalidate=3600`,
      },
    });
  } catch (error) {
    return NextResponse.json({
      message: error instanceof Error ? error.message : "天气预报暂不可用",
    }, {
      headers: { "Cache-Control": "no-store" },
      status: 502,
    });
  }
}
