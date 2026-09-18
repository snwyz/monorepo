import { type NextRequest, NextResponse } from "next/server";

import { requestTencentMapWebService } from "@/lib/tencent-map/tencent-map-web-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const location = request.nextUrl.searchParams.get("location") ?? undefined;
  if (keyword.length < 2 || keyword.length > 80) {
    return NextResponse.json({ status: 400, message: "搜索关键词长度应为 2—80 个字符" }, { status: 400 });
  }
  try {
    const result = await requestTencentMapWebService("/ws/place/v1/suggestion", {
      keyword,
      location,
      policy: "10",
      region_fix: "0",
    });
    return NextResponse.json(result.data, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({
      status: 500,
      message: error instanceof Error ? error.message : "地点搜索服务不可用",
    }, { status: 500 });
  }
}
