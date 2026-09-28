import { type NextRequest, NextResponse } from "next/server";

import { findRouteChargingStations } from "@/domain/route-charging/find-route-charging-stations";
import type { ChargingCoordinate, RouteChargingResult } from "@/domain/route-charging/model";
import { getTeslaSuperchargers } from "@/infrastructure/route-charging/tesla-supercharger-service";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_PATH_POINTS = 20_000;
const RADIUS_METERS = 2_000;
const headers = { "Cache-Control": "no-store" };

function isCoordinate(value: unknown): value is ChargingCoordinate {
  if (typeof value !== "object" || value === null) return false;
  const point = value as Record<string, unknown>;
  return typeof point.latitude === "number" && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 85
    && typeof point.longitude === "number" && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}

export async function POST(request: NextRequest) {
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ message: "请提供路段轨迹" }, { status: 400, headers });
  let body: unknown;
  try {
    const decoder = new TextDecoder();
    let size = 0;
    let json = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) return NextResponse.json({ message: "路段轨迹过大，请选择较短路段" }, { status: 413, headers });
      json += decoder.decode(value, { stream: true });
    }
    body = JSON.parse(json + decoder.decode());
  } catch {
    return NextResponse.json({ message: "路段轨迹格式无效" }, { status: 400, headers });
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const path = typeof body === "object" && body !== null && "path" in body ? body.path : null;
  if (!Array.isArray(path) || path.length < 2 || path.length > MAX_PATH_POINTS || !path.every(isCoordinate)) {
    return NextResponse.json({ message: "路段轨迹需包含 2 至 20000 个有效坐标" }, { status: 400, headers });
  }
  try {
    const catalogue = await getTeslaSuperchargers();
    const result: RouteChargingResult = {
      source: "tesla",
      fetchedAt: catalogue.fetchedAt,
      stale: catalogue.stale,
      radiusMeters: RADIUS_METERS,
      stations: findRouteChargingStations(catalogue.stations, path, RADIUS_METERS),
    };
    return NextResponse.json(result, { headers });
  } catch {
    return NextResponse.json({ message: "特斯拉超充站暂不可用，请稍后重试" }, { status: 502, headers });
  }
}
