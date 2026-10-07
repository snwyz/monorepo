import { type NextRequest, NextResponse } from "next/server";
import { ElevationServiceError, queryOpenTopoElevation } from "@/infrastructure/elevation-analysis/open-topo-service";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  if (process.env.NODE_ENV === "production" && process.env.ELEVATION_PUBLIC_API_ENABLED !== "1") return NextResponse.json({ message: "高程试验服务尚未启用，请先完成数据来源与共享限流配置" }, { status: 503, headers });
  // 坐标放在 POST 正文，响应禁止公共缓存，不接收来源URL或身份/方案信息。
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ message: "请求来源无效" }, { status: 403, headers });
  if (Number(request.headers.get("content-length")) > 20000) return NextResponse.json({ message: "高程查询过大" }, { status: 413, headers });
  try {
    const text = await request.text();
    if (text.length > 20000) return NextResponse.json({ message: "高程查询过大" }, { status: 413, headers });
    const body = JSON.parse(text);
    if (!body || typeof body !== "object") return NextResponse.json({ message: "高程请求格式无效" }, { status: 400, headers });
    const coordinates = body.coordinates;
    if (!Array.isArray(coordinates) || !coordinates.length || coordinates.length > 100 || coordinates.some((point) => !point || typeof point.latitude !== "number" || typeof point.longitude !== "number" || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180)) return NextResponse.json({ message: "高程查询坐标无效（每批1至100点）" }, { status: 400, headers });
    const result = await queryOpenTopoElevation(coordinates, request.signal);
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "高程请求格式无效" }, { status: 400, headers });
    return NextResponse.json({ message: error instanceof ElevationServiceError ? error.message : "高程服务暂不可用" }, { status: error instanceof ElevationServiceError ? error.status : 502, headers });
  }
}
