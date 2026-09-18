import { type NextRequest, NextResponse } from "next/server";

import { requestTencentMapWebService } from "@/lib/tencent-map/tencent-map-web-service";

export const runtime = "nodejs";

const coordinatePattern = /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/;

export async function GET(request: NextRequest) {
  const location = request.nextUrl.searchParams.get("location") ?? "";
  if (!coordinatePattern.test(location)) {
    return NextResponse.json(
      { status: 400, message: "待转换坐标格式无效" },
      { status: 400 },
    );
  }
  try {
    const result = await requestTencentMapWebService("/ws/coord/v1/translate", {
      locations: location,
      type: "1",
    });
    return NextResponse.json(result.data, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({
      status: 500,
      message: error instanceof Error ? error.message : "坐标转换服务不可用",
    }, { status: 500 });
  }
}
