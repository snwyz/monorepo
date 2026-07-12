// AI [2026-07-13]: 查询附近路线、路线详情并维护用户收藏
import { Injectable, NotFoundException } from "@nestjs/common";
import { haversineKm } from "@roadbook/utils";
import { DbService } from "../db/db.service";
import { NearbyQueryDto } from "./dto/nearby-query.dto";
@Injectable()
export class RoutesService {
  constructor(private db: DbService) {}
  async findNearby(q: NearbyQueryDto) {
    const r = await this.db.route.findMany({
      where: {
        status: "published",
        ...(q.min_lat != null &&
        q.max_lat != null &&
        q.min_lng != null &&
        q.max_lng != null
          ? {
              bounds_min_lat: { lte: q.max_lat },
              bounds_max_lat: { gte: q.min_lat },
              bounds_min_lng: { lte: q.max_lng },
              bounds_max_lng: { gte: q.min_lng },
            }
          : {}),
      },
      select: {
        id: true,
        title: true,
        difficulty: true,
        distance_km: true,
        start_lat: true,
        start_lng: true,
      },
    });
    return r
      .filter(
        (x) =>
          haversineKm(q.lat, q.lng, Number(x.start_lat), Number(x.start_lng)) <=
          q.radius_km,
      )
      .map((x) => ({
        ...x,
        distance_km: Number(x.distance_km),
        start_lat: Number(x.start_lat),
        start_lng: Number(x.start_lng),
      }));
  }
  async findOne(id: string, userId?: string) {
    const route = await this.db.route.findUnique({
      where: { id, status: "published" },
      ...(userId
        ? { include: { collections: { where: { user_id: userId } } } }
        : {}),
    });
    if (!route) throw new NotFoundException("Route not found");
    return {
      ...route,
      distance_km: Number(route.distance_km),
      start_lat: Number(route.start_lat),
      start_lng: Number(route.start_lng),
      end_lat: Number(route.end_lat),
      end_lng: Number(route.end_lng),
      is_collected: userId
        ? (route as typeof route & { collections?: unknown[] }).collections
            ?.length === 1
        : false,
    };
  }
  async collect(route_id: string, user_id: string) {
    await this.db.routeCollection.upsert({
      where: { user_id_route_id: { user_id, route_id } },
      create: { user_id, route_id },
      update: {},
    });
  }
  async uncollect(route_id: string, user_id: string) {
    await this.db.routeCollection.deleteMany({ where: { user_id, route_id } });
  }
}
