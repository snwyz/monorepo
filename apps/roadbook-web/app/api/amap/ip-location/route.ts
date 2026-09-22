import { type NextRequest, NextResponse } from "next/server";

import { requestAmapWebService } from "@/lib/amap/amap-web-service";

export const runtime = "nodejs";

function getPublicIpv4(request: NextRequest) {
  const value = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!value || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return undefined;
  const octets = value.split(".").map(Number);
  const isPrivate = octets.some((octet) => octet < 0 || octet > 255)
    || octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
  return isPrivate ? undefined : value;
}

export async function GET(request: NextRequest) {
  try {
    const result = await requestAmapWebService("/v3/ip", {
      ip: getPublicIpv4(request),
    });
    return NextResponse.json(result.data, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({
      status: "0",
      info: error instanceof Error ? error.message : "IP 定位服务不可用",
    }, { status: 500 });
  }
}
