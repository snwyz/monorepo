import type { DrivingRoute, MapCoordinate } from "@roadbook/map/web";
import { ELEVATION_POLICY, type ElevationGeometry, type RouteElevationPosition, type ElevationSample } from "./model";

export function coordinateDistance(a: MapCoordinate, b: MapCoordinate) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad)
    * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function interpolatePosition(a: RouteElevationPosition, b: RouteElevationPosition, distance: number): RouteElevationPosition {
  const fraction = b.distanceMeters === a.distanceMeters ? 0 : (distance - a.distanceMeters) / (b.distanceMeters - a.distanceMeters);
  return {
    ...a, distanceMeters: distance,
    legDistanceMeters: a.legDistanceMeters + (distance - a.distanceMeters),
    coordinate: {
      latitude: a.coordinate.latitude + (b.coordinate.latitude - a.coordinate.latitude) * fraction,
      longitude: a.coordinate.longitude + (b.coordinate.longitude - a.coordinate.longitude) * fraction,
    },
  };
}

// 签名保留方向、路段与每次经过；不以坐标去重，不拉伸供应商里程。
export function buildElevationGeometry(route: DrivingRoute, names: ReadonlyMap<string, string>, spacing = ELEVATION_POLICY.sampleSpacingMeters): ElevationGeometry {
  if (!Number.isFinite(spacing) || spacing <= 0) throw new Error("采样间距无效");
  let distance = 0;
  const vertices: RouteElevationPosition[] = [];
  const samples: ElevationSample[] = [];
  const controlPoints: ElevationGeometry["controlPoints"] = [];
  const signature = JSON.stringify([route.scope, route.legs.map((leg) => [leg.id, leg.fromControlPointId, leg.toControlPointId, leg.path])]);
  route.legs.forEach((leg, passageIndex) => {
    const start = distance;
    const legVertices = leg.path.map((coordinate, index) => {
      if (index) distance += coordinateDistance(leg.path[index - 1], coordinate);
      return { distanceMeters: distance, legId: leg.id, legDistanceMeters: distance - start, passageIndex, coordinate };
    });
    if (legVertices.length < 2 || distance === start) throw new Error("道路几何不足，暂无法分析高程");
    const first = legVertices[0];
    const last = legVertices[legVertices.length - 1];
    const previous = vertices[vertices.length - 1];
    const disconnected = Boolean(previous && coordinateDistance(previous.coordinate, first.coordinate) > ELEVATION_POLICY.connectionToleranceMeters);
    for (const vertex of legVertices) vertices.push(vertex);
    if (!passageIndex) controlPoints.push({ ...first, id: `${leg.fromControlPointId}:0`, name: names.get(leg.fromControlPointId) ?? "起点" });
    controlPoints.push({ ...last, id: `${leg.toControlPointId}:${passageIndex + 1}`, name: route.scope === "round-trip" && passageIndex === route.legs.length - 1 ? "返回起点" : names.get(leg.toControlPointId) ?? `控制点 ${passageIndex + 2}` });
    const distances = [start];
    for (let cursor = (Math.floor(start / spacing) + 1) * spacing; cursor < distance; cursor += spacing) distances.push(cursor);
    distances.push(distance);
    let vertexIndex = 1;
    for (const target of distances) {
      while (vertexIndex < legVertices.length - 1 && legVertices[vertexIndex].distanceMeters < target) vertexIndex++;
      if (target === start && samples.length && !disconnected) continue;
      const position = target === distance ? last : interpolatePosition(legVertices[vertexIndex - 1], legVertices[vertexIndex], target);
      samples.push({ ...position, rawElevationMeters: null, elevationMeters: null, quality: "missing", breakBefore: target === start && disconnected });
    }
  });
  if (!distance || samples.length > 25000) throw new Error("当前路线超出高程分析范围（最多约2500公里）");
  return { signature, samplingVersion: `distance-v1-connection-${ELEVATION_POLICY.connectionToleranceMeters}`, sampleSpacingMeters: spacing, vertices, samples, controlPoints, distanceMeters: distance, providerDistanceMeters: route.distanceMeters };
}

export function findPosition(positions: RouteElevationPosition[], distance: number) {
  let low = 0; let high = positions.length - 1;
  while (low < high) { const middle = Math.floor((low + high) / 2); if (positions[middle].distanceMeters < distance) low = middle + 1; else high = middle; }
  return low;
}

// 地图只读区间沿原折线裁剪，保留各路段边界，不连接不连续道路。
export function sliceElevationPaths(geometry: ElevationGeometry, start: number, end: number): MapCoordinate[][] {
  const paths: MapCoordinate[][] = [];
  let path: MapCoordinate[] = [];
  for (let i = 1; i < geometry.vertices.length; i++) {
    const a = geometry.vertices[i - 1]; const b = geometry.vertices[i];
    if (a.legId !== b.legId) { if (path.length > 1) paths.push(path); path = []; continue; }
    if (b.distanceMeters <= start || a.distanceMeters >= end || b.distanceMeters === a.distanceMeters) continue;
    const from = interpolatePosition(a, b, Math.max(start, a.distanceMeters));
    const to = interpolatePosition(a, b, Math.min(end, b.distanceMeters));
    if (!path.length) path.push(from.coordinate);
    path.push(to.coordinate);
  }
  if (path.length > 1) paths.push(path);
  return paths;
}
