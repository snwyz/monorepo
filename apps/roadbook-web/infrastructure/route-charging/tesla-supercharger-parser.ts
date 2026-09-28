import type { ChargingStation } from "@/domain/route-charging/model";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseTeslaSuperchargers(payload: unknown): ChargingStation[] {
  if (!Array.isArray(payload)) throw new Error("特斯拉站点目录格式已变化");
  const stations = new Map<string, ChargingStation>();
  for (const item of payload) {
    if (!record(item) || !Array.isArray(item.data)) continue;
    const id = text(item.location_id);
    const latitude = item.qq_lat;
    const longitude = item.qq_lng;
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)
      || typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 85
      || typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180
      || (latitude === 0 && longitude === 0)) continue;
    for (const detail of item.data) {
      if (!record(detail) || detail.location_type !== "supercharger") continue;
      const name = text(detail.title);
      if (!name || stations.has(id)) continue;
      const count = positiveNumber(detail.num_charger_stalls);
      stations.set(id, {
        id,
        sourceSiteId: /^\d+$/.test(String(item.trt_id ?? "")) ? String(item.trt_id) : null,
        name,
        address: text(detail.address),
        coordinate: { latitude, longitude },
        stallCount: count !== null && Number.isInteger(count) ? count : null,
        maximumPowerKw: positiveNumber(detail.installed_full_power),
        openToNonTesla: typeof detail.open_to_non_tesla === "boolean" ? detail.open_to_non_tesla : null,
        note: text(detail.note) || null,
      });
    }
  }
  if (stations.size === 0) throw new Error("特斯拉站点目录暂无有效超充站");
  return Array.from(stations.values());
}
