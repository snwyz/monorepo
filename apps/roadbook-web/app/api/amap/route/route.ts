import { type NextRequest, NextResponse } from "next/server";
import { requestAmapWebService } from "@/lib/amap/amap-web-service";
import { parseRouteCoordinate, parseRouteTravelMode } from "@/lib/map-routing/route-request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const from = parseRouteCoordinate(params.get("from"));
  const to = parseRouteCoordinate(params.get("to"));
  const mode = parseRouteTravelMode(params.get("mode"));
  if (!from || !to || !mode) return NextResponse.json({ status: "0", info: "起终点坐标或出行方式无效" }, { status: 400 });
  const strategy = params.get("strategy") ?? "19";
  try {
    const result = await requestAmapWebService(mode === "cycling" ? "/v4/direction/bicycling" : `/v3/direction/${mode}`, {
      origin: `${from[1]},${from[0]}`, destination: `${to[1]},${to[0]}`,
      ...(mode === "driving" ? { strategy: ["10", "13", "19", "20"].includes(strategy) ? strategy : "19", extensions: "all", nosteps: "0" } : {}),
    });
    if (mode !== "cycling") return NextResponse.json(result.data, { status: result.ok ? 200 : 502 });
    // 高德骑行 v4 使用 errcode/data，归一化为既有路线响应契约。
    const payload = result.data as { errcode?: number; errmsg?: string; data?: { paths?: unknown[] }; status?: string; info?: string };
    const success = result.ok && payload.errcode === 0;
    return NextResponse.json({ status: success ? "1" : "0", info: success ? "OK" : payload.errmsg ?? payload.info ?? "骑行路线暂不可用", route: success ? payload.data : undefined }, { status: success ? 200 : 502 });
  } catch {
    return NextResponse.json({ status: "0", info: "路线服务暂不可用，请稍后重试" }, { status: 502 });
  }
}
