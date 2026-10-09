import type { DrivingRouteLeg, DrivingStrategy, MapCoordinate, RouteTravelMode } from "./web-types";

// 同一供应商实例内复用未改变的路段，减少单段编辑的外部请求。
export class RouteLegCache {
  private readonly entries = new Map<string, { leg: DrivingRouteLeg; expiresAt: number }>();

  key(from: MapCoordinate & { id: string }, to: MapCoordinate & { id: string }, strategy: DrivingStrategy, mode: RouteTravelMode) {
    return JSON.stringify([from.id, from.latitude, from.longitude, to.id, to.latitude, to.longitude, mode, mode === "driving" ? strategy : null]);
  }

  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt < Date.now()) { this.entries.delete(key); return null; }
    return entry.leg;
  }

  put(key: string, leg: DrivingRouteLeg) {
    this.entries.delete(key);
    this.entries.set(key, { leg, expiresAt: Date.now() + 5 * 60_000 });
    if (this.entries.size > 128) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }
}
