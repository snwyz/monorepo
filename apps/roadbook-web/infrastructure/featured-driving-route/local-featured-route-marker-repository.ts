import type { FeaturedRouteUserMarker } from "@/domain/featured-driving-route/model";

const STORAGE_PREFIX = "roadbook:featured-route-markers:v1:";

function isMarker(value: unknown, routeId: string): value is FeaturedRouteUserMarker {
  if (!value || typeof value !== "object") return false;
  const marker = value as Partial<FeaturedRouteUserMarker>;
  return marker.routeId === routeId
    && typeof marker.id === "string"
    && typeof marker.name === "string"
    && typeof marker.address === "string"
    && typeof marker.latitude === "number"
    && Number.isFinite(marker.latitude)
    && typeof marker.longitude === "number"
    && Number.isFinite(marker.longitude)
    && typeof marker.createdAt === "string";
}

export class LocalFeaturedRouteMarkerRepository {
  list(routeId: string) {
    if (typeof window === "undefined") return [];
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(`${STORAGE_PREFIX}${routeId}`) ?? "[]",
      ) as unknown;
      return Array.isArray(stored)
        ? stored.filter((item) => isMarker(item, routeId))
        : [];
    } catch {
      return [];
    }
  }

  save(routeId: string, markers: FeaturedRouteUserMarker[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${routeId}`,
      JSON.stringify(markers),
    );
  }

  clear(routeId: string) {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${routeId}`);
    }
  }
}

