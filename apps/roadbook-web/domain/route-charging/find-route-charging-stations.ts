import type { ChargingCoordinate, ChargingStation, RouteChargingStation } from "./model";

const METERS_PER_RADIAN = 6_371_008.8;
const RADIANS = Math.PI / 180;

export function findRouteChargingStations(
  stations: readonly ChargingStation[],
  path: readonly ChargingCoordinate[],
  radiusMeters: number,
): RouteChargingStation[] {
  if (path.length < 2 || radiusMeters <= 0) return [];
  let cumulativeMeters = 0;
  const segments = path.slice(1).map((to, index) => {
    const from = path[index];
    const longitudeScale = Math.cos((from.latitude + to.latitude) / 2 * RADIANS);
    const dx = (to.longitude - from.longitude) * RADIANS * METERS_PER_RADIAN * longitudeScale;
    const dy = (to.latitude - from.latitude) * RADIANS * METERS_PER_RADIAN;
    const length = Math.hypot(dx, dy);
    const startMeters = cumulativeMeters;
    cumulativeMeters += length;
    const latitudePadding = radiusMeters / METERS_PER_RADIAN / RADIANS;
    const longitudePadding = latitudePadding / Math.max(0.01, Math.cos(
      Math.max(Math.abs(from.latitude), Math.abs(to.latitude)) * RADIANS,
    ));
    return {
      from, dx, dy, length, startMeters, longitudeScale,
      south: Math.min(from.latitude, to.latitude) - latitudePadding,
      north: Math.max(from.latitude, to.latitude) + latitudePadding,
      west: Math.min(from.longitude, to.longitude) - longitudePadding,
      east: Math.max(from.longitude, to.longitude) + longitudePadding,
    };
  });

  const matches: RouteChargingStation[] = [];
  for (const station of stations) {
    const point = station.coordinate;
    let nearestDistance = Infinity;
    let nearestProgress = 0;
    for (const segment of segments) {
      if (point.latitude < segment.south || point.latitude > segment.north
        || point.longitude < segment.west || point.longitude > segment.east) continue;
      const x = (point.longitude - segment.from.longitude) * RADIANS * METERS_PER_RADIAN * segment.longitudeScale;
      const y = (point.latitude - segment.from.latitude) * RADIANS * METERS_PER_RADIAN;
      const projection = segment.length === 0 ? 0 : Math.max(0, Math.min(1,
        (x * segment.dx + y * segment.dy) / (segment.length * segment.length),
      ));
      const distance = Math.hypot(x - projection * segment.dx, y - projection * segment.dy);
      if (distance >= nearestDistance) continue;
      nearestDistance = distance;
      nearestProgress = segment.startMeters + projection * segment.length;
    }
    if (nearestDistance <= radiusMeters) matches.push({
      ...station,
      distanceFromRouteMeters: Math.round(nearestDistance),
      distanceAlongRouteMeters: Math.round(nearestProgress),
    });
  }
  return matches.sort((a, b) => a.distanceAlongRouteMeters - b.distanceAlongRouteMeters
    || a.distanceFromRouteMeters - b.distanceFromRouteMeters || a.id.localeCompare(b.id));
}
