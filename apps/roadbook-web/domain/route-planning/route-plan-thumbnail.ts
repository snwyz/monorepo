import type { DrivingRoute } from "@roadbook/map/web";
import { routeCalculationIdentity } from "./calculation-context";
import type { RoutePlan, RoutePlanThumbnail } from "./model";

type Point = [number, number];
const MAX_POINTS = 96;

export function isRoutePlanThumbnail(value: unknown): value is RoutePlanThumbnail {
  if (!value || typeof value !== "object") return false;
  const thumbnail = value as Partial<RoutePlanThumbnail>;
  if (typeof thumbnail.inputIdentity !== "string" || thumbnail.inputIdentity.length > 6000
    || (thumbnail.mapProvider !== "amap" && thumbnail.mapProvider !== "tencent")
    || !Array.isArray(thumbnail.paths) || !thumbnail.paths.length || thumbnail.paths.length > 20) return false;
  let count = 0;
  return thumbnail.paths.every((path) => {
    if (!Array.isArray(path) || path.length < 2) return false;
    count += path.length;
    return count <= MAX_POINTS && path.every((point) => Array.isArray(point) && point.length === 2
      && point.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)
        && coordinate >= 4 && coordinate <= 32));
  });
}

export function getRoutePlanThumbnail(plan: RoutePlan) {
  return isRoutePlanThumbnail(plan.thumbnail)
    && plan.thumbnail.inputIdentity === routeCalculationIdentity(plan, plan.thumbnail.mapProvider)
    ? plan.thumbnail : undefined;
}

// 在归一化画布上抽稀，保留每段端点和明显转折，不连接道路缺口。
function simplify(points: Point[], tolerance: number): Point[] {
  const kept = new Set([0, points.length - 1]);
  const pending: Point[] = [[0, points.length - 1]];
  while (pending.length) {
    const [start, end] = pending.pop()!;
    const [ax, ay] = points[start];
    const [bx, by] = points[end];
    const dx = bx - ax, dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    let farthest = -1, maximum = tolerance * tolerance;
    for (let index = start + 1; index < end; index++) {
      const [x, y] = points[index];
      const t = lengthSquared ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared)) : 0;
      const distance = (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
      if (distance > maximum) { maximum = distance; farthest = index; }
    }
    if (farthest >= 0) {
      kept.add(farthest);
      pending.push([start, farthest], [farthest, end]);
    }
  }
  return [...kept].sort((a, b) => a - b).map((index) => points[index]);
}

export function createRoutePlanThumbnail(
  route: DrivingRoute,
  inputIdentity: string,
  mapProvider: RoutePlanThumbnail["mapProvider"],
): RoutePlanThumbnail | undefined {
  if (route.scope !== "one-way" || !route.legs.length || route.legs.length > 20) return undefined;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let previousLongitude: number | undefined;
  const projected: Point[][] = [];
  for (const leg of route.legs) {
    if (leg.path.length < 2) return undefined;
    const path: Point[] = [];
    for (const coordinate of leg.path) {
      const { latitude, longitude } = coordinate;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
        || Math.abs(latitude) > 85 || Math.abs(longitude) > 180) return undefined;
      let x = longitude;
      if (previousLongitude !== undefined) x += 360 * Math.round((previousLongitude - x) / 360);
      previousLongitude = x;
      const y = -Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) * 180 / Math.PI;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      path.push([x, y]);
    }
    projected.push(path);
  }
  const extent = Math.max(maxX - minX, maxY - minY);
  if (extent <= 0) return undefined;
  const scale = 28 / extent;
  const normalized = projected.map((path) => path.map(([x, y]): Point => [
    18 + (x - (minX + maxX) / 2) * scale,
    18 + (y - (minY + maxY) / 2) * scale,
  ]));
  let tolerance = 0.55;
  let paths = normalized.map((path) => simplify(path, tolerance));
  while (paths.reduce((total, path) => total + path.length, 0) > MAX_POINTS) {
    tolerance *= 1.5;
    paths = normalized.map((path) => simplify(path, tolerance));
  }
  paths = paths.map((path) => path.map(([x, y]): Point => [Number(x.toFixed(1)), Number(y.toFixed(1))]));
  const thumbnail = { inputIdentity, mapProvider, paths };
  return isRoutePlanThumbnail(thumbnail) ? thumbnail : undefined;
}
