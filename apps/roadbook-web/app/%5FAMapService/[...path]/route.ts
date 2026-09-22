import { type NextRequest, NextResponse } from "next/server";

import {
  createAmapAuthenticatedUrl,
  getAmapJsCredentials,
  hasInvalidAmapSignature,
} from "@/lib/amap/amap-web-service";

export const runtime = "nodejs";

const allowedPaths = new Set([
  "v3/assistant/coordinate/convert",
  "v3/assistant/inputtips",
  "v3/direction/driving",
  "v3/geocode/regeo",
  "v3/ip",
  "v4/map/styles",
]);

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { path: segments } = await context.params;
  const path = segments.join("/");
  if (!allowedPaths.has(path)) {
    return NextResponse.json({ status: "0", info: "不支持的高德服务路径" }, { status: 404 });
  }
  try {
    const host = path === "v4/map/styles" ? "webapi.amap.com" : "restapi.amap.com";
    const credentials = getAmapJsCredentials();
    const requestUpstream = (mode: "jscode" | "signature") => fetch(
      createAmapAuthenticatedUrl(
        `https://${host}`,
        `/${path}`,
        request.nextUrl.searchParams,
        mode,
        credentials,
      ),
      { cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    let response = await requestUpstream("jscode");
    let body = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "application/json; charset=utf-8";
    if (contentType.includes("json")) {
      try {
        if (hasInvalidAmapSignature(JSON.parse(new TextDecoder().decode(body)))) {
          response = await requestUpstream("signature");
          body = await response.arrayBuffer();
        }
      } catch {
        // JSONP 或非标准响应保持原样返回给高德 SDK。
      }
    }
    return new Response(body, {
      status: response.status,
      headers: {
        "cache-control": "no-store",
        "content-type": response.headers.get("content-type") ?? contentType,
      },
    });
  } catch (error) {
    return NextResponse.json({
      status: "0",
      info: error instanceof Error ? error.message : "高德安全代理不可用",
    }, { status: 500 });
  }
}
