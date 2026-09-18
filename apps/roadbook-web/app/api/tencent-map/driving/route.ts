import { type NextRequest, NextResponse } from "next/server";

import { requestTencentMapWebService } from "@/lib/tencent-map/tencent-map-web-service";

export const runtime = "nodejs";

const coordinatePattern = /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/;
const allowedPolicies = new Set([
  "LEAST_TIME,REAL_TRAFFIC",
  "LEAST_TIME,AVOID_HIGHWAY",
]);

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";
  const requestedPolicy = request.nextUrl.searchParams.get("policy") ?? "LEAST_TIME,REAL_TRAFFIC";
  if (!coordinatePattern.test(from) || !coordinatePattern.test(to)) {
    return NextResponse.json({ status: 400, message: "起终点坐标格式无效" }, { status: 400 });
  }
  const policy = allowedPolicies.has(requestedPolicy) ? requestedPolicy : "LEAST_TIME,REAL_TRAFFIC";
  try {
    const result = await requestTencentMapWebService("/ws/direction/v1/driving/", {
      from,
      to,
      policy,
    });
    return NextResponse.json(result.data, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({
      status: 500,
      message: error instanceof Error ? error.message : "驾车路线服务不可用",
    }, { status: 500 });
  }
}
