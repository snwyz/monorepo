import type { MapCoordinate } from "@roadbook/map/web";
import { ELEVATION_SOURCE, type ElevationBatch, type ElevationProvider } from "../../domain/elevation-analysis/model";

export class HttpElevationProvider implements ElevationProvider {
  async query(coordinates: MapCoordinate[], signal: AbortSignal): Promise<ElevationBatch> {
    const response = await fetch("/api/elevation-analysis", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates }), signal: AbortSignal.any([signal, AbortSignal.timeout(40000)]),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "高程查询失败，请稍后重试");
    if (data.sourceVersion !== ELEVATION_SOURCE.version || !Array.isArray(data.elevations) || data.elevations.length !== coordinates.length || data.elevations.some((value: unknown) => value !== null && (typeof value !== "number" || !Number.isFinite(value)))) throw new Error("高程响应无效，请稍后重试");
    return data as ElevationBatch;
  }
}
