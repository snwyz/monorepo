import { type NextRequest, NextResponse } from "next/server";

import { requestAmapWebService } from "@/lib/amap/amap-web-service";

export const runtime = "nodejs";

const coordinatePattern = /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/;

export async function GET(request: NextRequest) {
  const location = request.nextUrl.searchParams.get("location") ?? "";
  if (!coordinatePattern.test(location)) {
    return NextResponse.json({ status: "0", info: "坐标格式无效" }, { status: 400 });
  }
  const [latitude, longitude] = location.split(",");
  try {
    const result = await requestAmapWebService("/v3/assistant/coordinate/convert", {
      locations: `${longitude},${latitude}`,
      coordsys: "gps",
    });
    return NextResponse.json(result.data, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({
      status: "0",
      info: error instanceof Error ? error.message : "坐标转换服务不可用",
    }, { status: 500 });
  }
}
