import { type NextRequest, NextResponse } from "next/server";

import type { ChargingStationDetailsResult } from "@/domain/route-charging/model";
import { getTeslaStationDetails, getTeslaSuperchargers } from "@/infrastructure/route-charging/tesla-supercharger-service";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function GET(_request: NextRequest, context: { params: Promise<{ stationId: string }> }) {
  const { stationId } = await context.params;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(stationId)) {
    return NextResponse.json({ message: "超充站标识无效" }, { status: 400, headers });
  }
  try {
    const directory = await getTeslaSuperchargers();
    const station = directory.stations.find((item) => item.id === stationId);
    if (!station?.sourceSiteId) {
      return NextResponse.json({ message: "未找到该超充站详情" }, { status: 404, headers });
    }
    const snapshot = await getTeslaStationDetails(station.sourceSiteId);
    const result: ChargingStationDetailsResult = {
      stationId,
      source: "tesla",
      fetchedAt: snapshot.fetchedAt,
      details: snapshot.details,
    };
    return NextResponse.json(result, { headers });
  } catch {
    return NextResponse.json({ message: "超充站详情暂不可用，请稍后重试" }, { status: 502, headers });
  }
}
