import { type NextRequest, NextResponse } from "next/server";

import { requestAmapWebService } from "@/lib/amap/amap-web-service";

export const runtime = "nodejs";

const coordinatePattern = /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/;

export async function GET(request: NextRequest) {
  const keywords = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const location = request.nextUrl.searchParams.get("location") ?? "";
  if (keywords.length < 2 || keywords.length > 80) {
    return NextResponse.json({ status: "0", info: "搜索关键词长度无效" }, { status: 400 });
  }
  const [latitude, longitude] = location.split(",");
  const normalizedLocation = coordinatePattern.test(location)
    ? `${longitude},${latitude}`
    : undefined;
  try {
    const result = await requestAmapWebService("/v3/assistant/inputtips", {
      keywords,
      location: normalizedLocation,
      datatype: "poi",
      citylimit: "false",
    });
    return NextResponse.json(result.data, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({
      status: "0",
      info: error instanceof Error ? error.message : "地点搜索服务不可用",
    }, { status: 500 });
  }
}
