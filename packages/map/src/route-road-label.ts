import type { MapCoordinate, RouteRoadSection, WebMapControlPoint, WebMapRouteLeg } from "./web-types";
import { createControlPointLabelVisual } from "./control-point-label";
import { isValidMapCoordinate, projectCoordinateToViewport } from "./web-viewport";

export function mergeRoadSections(sections: Array<{ name: unknown; path: MapCoordinate[] }>): RouteRoadSection[] {
  const result: RouteRoadSection[] = [];
  let previous: RouteRoadSection | undefined;
  for (const section of sections) {
    const name = typeof section.name === "string" ? section.name.trim() : "";
    if (!name || /^(无名道路?|未命名道路?|内部道路?|道路)$/.test(name)
      || section.path.length < 2 || !section.path.every(isValidMapCoordinate)) {
      previous = undefined;
      continue;
    }
    const start = section.path[0];
    const end = previous?.path[previous.path.length - 1];
    if (previous?.name === name && end
      && Math.abs(end.latitude - start.latitude) < 0.00001
      && Math.abs(end.longitude - start.longitude) < 0.00001) {
      for (let i = 1; i < section.path.length; i += 1) previous.path.push(section.path[i]);
    } else {
      previous = { name, path: [...section.path] };
      result.push(previous);
    }
  }
  return result;
}

// 腾讯下标指向原始经纬度数值数组，结束下标包含在范围内。
export function getTencentRoadPath(path: MapCoordinate[], indices?: number[]): MapCoordinate[] {
  if (!indices || indices.length !== 2) return [];
  const [start, end] = indices;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0
    || start % 2 !== 0 || end % 2 !== 1 || end <= start || end >= path.length * 2) return [];
  return path.slice(start / 2, (end + 1) / 2);
}

export function createRoadLabelVisual(name: string) {
  const characters = Array.from(name);
  const text = characters.length > 14 ? `${characters.slice(0, 14).join("")}…` : name;
  const width = 20 + Array.from(text).reduce((sum, char) => sum + (char.codePointAt(0)! < 256 ? 7 : 12), 0);
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="36"><path d="M${width / 2} 25v9" stroke="#8e8e93"/><rect x="1" y="1" width="${width - 2}" height="24" rx="7" fill="#fff" fill-opacity=".96" stroke="#d1d1d6"/><text x="${width / 2}" y="17" text-anchor="middle" font-family="Arial,'PingFang SC','Microsoft YaHei',sans-serif" font-size="12" font-weight="600" fill="#1c1c1e">${escaped}</text></svg>`;
  return { source: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, width, height: 36, anchor: { x: width / 2, y: 36 } };
}

type Viewport = Parameters<typeof projectCoordinateToViewport>[1];
type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width + 12 && a.x + a.width + 12 > b.x
  && a.y < b.y + b.height + 12 && a.y + a.height + 12 > b.y;

export function selectRoadLabels(legs: WebMapRouteLeg[], points: WebMapControlPoint[], viewport: Viewport) {
  if (!legs.some((leg) => !leg.failed && !leg.stale && leg.roadSections?.length)) return [];
  const occupied: Box[] = points.map((point) => {
    const pixel = projectCoordinateToViewport(point, viewport);
    const visual = createControlPointLabelVisual(point);
    return { x: pixel.x - visual.anchor.x, y: pixel.y - visual.anchor.y, width: visual.width, height: visual.height };
  });
  const candidates = legs.filter((leg) => !leg.failed && !leg.stale).flatMap((leg) =>
    (leg.roadSections ?? []).map((road) => {
      const pixels = road.path.map((point) => projectCoordinateToViewport(point, viewport));
      const distances = [0];
      for (let i = 1; i < pixels.length; i += 1) {
        distances.push(distances[i - 1] + Math.hypot(pixels[i].x - pixels[i - 1].x, pixels[i].y - pixels[i - 1].y));
      }
      return { road, selected: Boolean(leg.selected), distances, length: distances[distances.length - 1] ?? 0 };
    }));
  candidates.sort((a, b) => Number(b.selected) - Number(a.selected) || b.length - a.length);
  const result: Array<{ name: string; coordinate: MapCoordinate; visual: ReturnType<typeof createRoadLabelVisual> }> = [];
  const names = new Set<string>();
  for (const candidate of candidates) {
    const { road, distances, length } = candidate;
    if (names.has(road.name) || length < 100) continue;
    const visual = createRoadLabelVisual(road.name);
    for (const fraction of [0.5, 0.25, 0.75]) {
      const target = length * fraction;
      const index = distances.findIndex((distance, i) => i > 0 && distance >= target);
      if (index < 1) continue;
      const previous = road.path[index - 1];
      const next = road.path[index];
      const ratio = (target - distances[index - 1]) / (distances[index] - distances[index - 1] || 1);
      const coordinate = { latitude: previous.latitude + (next.latitude - previous.latitude) * ratio, longitude: previous.longitude + (next.longitude - previous.longitude) * ratio };
      const pixel = projectCoordinateToViewport(coordinate, viewport);
      const box = { x: pixel.x - visual.anchor.x, y: pixel.y - visual.anchor.y, width: visual.width, height: visual.height };
      if (box.x < 12 || box.y < 12 || box.x + box.width > viewport.width - 12
        || box.y + box.height > viewport.height - 12 || occupied.some((other) => overlaps(box, other))) continue;
      result.push({ name: road.name, coordinate, visual });
      occupied.push(box);
      names.add(road.name);
      break;
    }
    if (result.length >= 16) break;
  }
  return result;
}
