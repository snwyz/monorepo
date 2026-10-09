import { type NextRequest, NextResponse } from "next/server";
import { requestTencentMapWebService } from "@/lib/tencent-map/tencent-map-web-service";
import { parseRouteCoordinate, parseRouteTravelMode } from "@/lib/map-routing/route-request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const from = parseRouteCoordinate(params.get("from"));
  const to = parseRouteCoordinate(params.get("to"));
  const mode = parseRouteTravelMode(params.get("mode"));
  if (!from || !to || !mode) return NextResponse.json({ status: 400, message: "起终点坐标或出行方式无效" }, { status: 400 });
  const policy = params.get("policy") ?? "LEAST_TIME,REAL_TRAFFIC";
  try {
    const result = await requestTencentMapWebService(`/ws/direction/v1/${mode === "cycling" ? "bicycling" : mode}/`, {
      from: from.join(","), to: to.join(","),
      ...(mode === "driving" ? { policy: ["LEAST_TIME,REAL_TRAFFIC", "LEAST_TIME,AVOID_HIGHWAY"].includes(policy) ? policy : "LEAST_TIME,REAL_TRAFFIC" } : {}),
    });
    return NextResponse.json(result.data, { status: result.ok ? 200 : 502 });
  } catch {
    return NextResponse.json({ status: 502, message: "路线服务暂不可用，请稍后重试" }, { status: 502 });
  }
}
