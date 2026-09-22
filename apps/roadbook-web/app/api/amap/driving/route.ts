import { type NextRequest, NextResponse } from "next/server";

import { requestAmapWebService } from "@/lib/amap/amap-web-service";

export const runtime = "nodejs";

const coordinatePattern = /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/;
const allowedStrategies = new Set(["10", "13", "20"]);

function toAmapCoordinate(value: string) {
  const [latitude, longitude] = value.split(",");
  return `${longitude},${latitude}`;
}

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";
  const requestedStrategy = request.nextUrl.searchParams.get("strategy") ?? "10";
  if (!coordinatePattern.test(from) || !coordinatePattern.test(to)) {
    return NextResponse.json({ status: "0", info: "起终点坐标格式无效" }, { status: 400 });
  }
  const strategy = allowedStrategies.has(requestedStrategy) ? requestedStrategy : "10";
  try {
    const result = await requestAmapWebService("/v3/direction/driving", {
      origin: toAmapCoordinate(from),
      destination: toAmapCoordinate(to),
      strategy,
      extensions: "all",
      nosteps: "0",
    });
    return NextResponse.json(result.data, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({
      status: "0",
      info: error instanceof Error ? error.message : "驾车路线服务不可用",
    }, { status: 500 });
  }
}
