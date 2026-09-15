// AI [2026-07-13]: 查询指定路线周边的营地与充电 POI
import { Injectable, NotFoundException } from "@nestjs/common";
import { haversineKm } from "@roadbook/utils";
import { DbService } from "../db/db.service";
@Injectable()
export class PoisService {
  constructor(private db: DbService) {}
  async findNearRoute(routeId: string, distanceKm = 5) {
    const route = await this.db.route.findUnique({
      where: { id: routeId, status: "published" },
    });
    if (!route) throw new NotFoundException("Route not found");
    const pois = await this.db.pOI.findMany({
      where: {
        lat: {
          gte: Number(route.bounds_min_lat) - distanceKm / 111,
          lte: Number(route.bounds_max_lat) + distanceKm / 111,
        },
        lng: {
          gte: Number(route.bounds_min_lng) - distanceKm / 85,
          lte: Number(route.bounds_max_lng) + distanceKm / 85,
        },
      },
    });
    const polyline = Array.isArray(route.polyline)
      ? (route.polyline as Array<{ lat: number; lng: number }>)
      : [];
    return pois
      .map((p) => {
        const lat = Number(p.lat),
          lng = Number(p.lng);
        const dist_km = polyline.length
          ? Math.min(
              ...polyline.map((pt) => haversineKm(lat, lng, pt.lat, pt.lng)),
            )
          : 0;
        return { ...p, lat, lng, dist_km };
      })
      .filter((p) => polyline.length === 0 || p.dist_km <= distanceKm)
      .sort((a, b) => a.dist_km - b.dist_km);
  }
}
