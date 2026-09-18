import { NextResponse } from "next/server";

import { requestTencentMapWebService } from "@/lib/tencent-map/tencent-map-web-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await requestTencentMapWebService("/ws/location/v1/ip", {});
    return NextResponse.json(result.data, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({
      status: 500,
      message: error instanceof Error ? error.message : "IP 定位服务不可用",
    }, { status: 500 });
  }
}
