import { type NextRequest, NextResponse } from "next/server";

import { requestTencentMapWebService } from "@/lib/tencent-map/tencent-map-web-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const location = request.nextUrl.searchParams.get("location") ?? "";
  if (!/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(location)) {
    return NextResponse.json({ status: 400, message: "坐标格式无效" }, { status: 400 });
  }
  try {
    const result = await requestTencentMapWebService("/ws/geocoder/v1", {
      get_poi: "0",
      location,
    });
    return NextResponse.json(result.data, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({
      status: 500,
      message: error instanceof Error ? error.message : "地址解析服务不可用",
    }, { status: 500 });
  }
}
