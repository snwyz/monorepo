import type { MapCoordinate, RouteRoadSection, WebMapControlPoint, WebMapRouteLeg } from "./web-types";
import { createControlPointLabelVisual } from "./control-point-label";
import { isValidMapCoordinate, projectCoordinateToViewport } from "./web-viewport";
import { mapOverlayColors } from "./map-overlay-style";

export function mergeRoadSections(sections: Array<{ name: unknown; path: MapCoordinate[]; connectsToPrevious?: boolean }>): RouteRoadSection[] {
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
    const sharedEndpoint = end && Math.abs(end.latitude - start.latitude) < 0.00001
      && Math.abs(end.longitude - start.longitude) < 0.00001;
    if (previous?.name === name && (sharedEndpoint || section.connectsToPrevious)) {
      for (let i = sharedEndpoint ? 1 : 0; i < section.path.length; i += 1) previous.path.push(section.path[i]);
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

type Pixel = { x: number; y: number };
type Viewport = Parameters<typeof projectCoordinateToViewport>[1] & {
  project?: (coordinate: MapCoordinate) => Pixel;
};
type Box = Pixel & { width: number; height: number };
type RoadLabelVisual = { source: string; width: number; height: number; anchor: Pixel };
export type RouteRoadLabel = {
  name: string;
  coordinate: MapCoordinate;
  angle: number; // 屏幕坐标系，顺时针为正；保持文字正向可读。
  isReturn: boolean;
  visual: RoadLabelVisual;
};

const visualCache = new Map<string, RoadLabelVisual>();
const LABEL_MIN_ZOOM = 14;
const LABEL_SPACING = 280;
const VIEWPORT_MARGIN = 12;
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width + 8 && a.x + a.width + 8 > b.x
  && a.y < b.y + b.height + 8 && a.y + a.height + 8 > b.y;

export function createRoadLabelVisual(name: string, isReturn = false): RoadLabelVisual {
  const characters = Array.from(name);
  const text = characters.length > 14 ? `${characters.slice(0, 14).join("")}…` : name;
  const key = `${isReturn}:${text}`;
  const cached = visualCache.get(key);
  if (cached) return cached;
  const textWidth = Array.from(text).reduce((sum, char) => sum + (char.codePointAt(0)! < 256 ? 7.2 : 12), 0);
  const width = Math.ceil(textWidth + 12);
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  const color = isReturn ? mapOverlayColors.returnRouteCore : mapOverlayColors.routeCore;
  const halo = isReturn ? "#0060b5" : "#146d35";
  // 与内芯同色的窄底层遮住原生方向箭头，不增加卡片或引导线。
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="16"><rect width="${width}" height="16" fill="${color}"/><text x="${width / 2}" y="12" text-anchor="middle" textLength="${textWidth}" lengthAdjust="spacingAndGlyphs" font-family="Arial,'PingFang SC','Microsoft YaHei',sans-serif" font-size="12" font-weight="600" fill="#fff" stroke="${halo}" stroke-width="1.5" stroke-linejoin="round" paint-order="stroke fill">${escaped}</text></svg>`;
  const visual = { source: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, width, height: 16, anchor: { x: width / 2, y: 8 } };
  if (visualCache.size >= 256) visualCache.clear();
  visualCache.set(key, visual);
  return visual;
}

type ProjectedRoad = {
  road: RouteRoadSection;
  pixels: Pixel[];
  distances: number[];
  length: number;
  paintPriority: number;
  isReturn: boolean;
};

function sampleRoad(road: ProjectedRoad, distance: number) {
  // 二分定位避免长道路在每个候选位置重新遍历全部坐标。
  let low = 1;
  let high = road.distances.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (road.distances[middle] < distance) low = middle + 1;
    else high = middle;
  }
  const segmentLength = road.distances[low] - road.distances[low - 1];
  const ratio = segmentLength > 0 ? (distance - road.distances[low - 1]) / segmentLength : 0;
  const previous = road.pixels[low - 1];
  const next = road.pixels[low];
  const from = road.road.path[low - 1];
  const to = road.road.path[low];
  return {
    index: low,
    x: previous.x + (next.x - previous.x) * ratio,
    y: previous.y + (next.y - previous.y) * ratio,
    coordinate: { latitude: from.latitude + (to.latitude - from.latitude) * ratio, longitude: from.longitude + (to.longitude - from.longitude) * ratio },
  };
}

// 裁剪每段道路后生成可见弧长区间，长路中点在屏幕外时仍能标注。
function visibleIntervals(road: ProjectedRoad, viewport: Viewport) {
  const intervals: Array<{ start: number; end: number }> = [];
  for (let index = 1; index < road.pixels.length; index += 1) {
    const from = road.pixels[index - 1];
    const to = road.pixels[index];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let start = 0;
    let end = 1;
    const edges = [
      [-dx, from.x - VIEWPORT_MARGIN], [dx, viewport.width - VIEWPORT_MARGIN - from.x],
      [-dy, from.y - VIEWPORT_MARGIN], [dy, viewport.height - VIEWPORT_MARGIN - from.y],
    ];
    for (const [direction, remaining] of edges) {
      if (direction === 0) {
        if (remaining < 0) end = -1;
      } else if (direction < 0) start = Math.max(start, remaining / direction);
      else end = Math.min(end, remaining / direction);
    }
    const segmentLength = road.distances[index] - road.distances[index - 1];
    if (start > end || segmentLength === 0) continue;
    const interval = {
      start: road.distances[index - 1] + start * segmentLength,
      end: road.distances[index - 1] + end * segmentLength,
    };
    const previous = intervals[intervals.length - 1];
    if (previous && interval.start - previous.end < 0.01) previous.end = interval.end;
    else intervals.push(interval);
  }
  return intervals;
}

function labelPlacement(road: ProjectedRoad, distance: number, visual: RoadLabelVisual) {
  const halfSpan = visual.width / 2 + 8;
  if (distance < halfSpan || distance + halfSpan > road.length) return null;
  const center = sampleRoad(road, distance);
  const start = sampleRoad(road, distance - halfSpan);
  const end = sampleRoad(road, distance + halfSpan);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const chord = Math.hypot(dx, dy);
  if (chord < halfSpan * 1.9) return null;
  // 检查文字覆盖范围的每个拐点及内部采样，避免文字横跨急弯。
  const fits = (pixel: Pixel) => Math.abs((pixel.x - center.x) * dy - (pixel.y - center.y) * dx) / chord <= 1.5;
  for (let offset = -halfSpan; offset <= halfSpan; offset += 8) {
    if (!fits(sampleRoad(road, distance + offset))) return null;
  }
  for (let index = start.index; index < road.distances.length; index += 1) {
    if (road.distances[index] > distance + halfSpan) break;
    if (!fits(road.pixels[index])) return null;
  }
  let angle = Math.atan2(dy, dx) * 180 / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  const radians = angle * Math.PI / 180;
  const width = Math.abs(Math.cos(radians)) * visual.width + Math.abs(Math.sin(radians)) * visual.height;
  const height = Math.abs(Math.sin(radians)) * visual.width + Math.abs(Math.cos(radians)) * visual.height;
  return { center, angle, box: { x: center.x - width / 2, y: center.y - height / 2, width, height } };
}

function isCoveredByRoute(point: Pixel, pixels: Pixel[]) {
  for (let index = 1; index < pixels.length; index += 1) {
    const from = pixels[index - 1];
    const to = pixels[index];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const ratio = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy || 1)));
    if (Math.hypot(point.x - from.x - dx * ratio, point.y - from.y - dy * ratio) < 14) return true;
  }
  return false;
}

export function selectRoadLabels(legs: WebMapRouteLeg[], points: WebMapControlPoint[], viewport: Viewport): RouteRoadLabel[] {
  if (viewport.zoom < LABEL_MIN_ZOOM || viewport.width <= 0 || viewport.height <= 0) return [];
  if (!legs.some((leg) => !leg.failed && !leg.stale && leg.roadSections?.length)) return [];
  const project = viewport.project ?? ((coordinate: MapCoordinate) => projectCoordinateToViewport(coordinate, viewport));
  const occupied: Box[] = points.map((point) => {
    const pixel = project(point);
    const visual = createControlPointLabelVisual(point);
    return { x: pixel.x - visual.anchor.x, y: pixel.y - visual.anchor.y, width: visual.width, height: visual.height };
  });
  const validLegs = legs.filter((leg) => !leg.failed && !leg.stale);
  const projectedRoutes = validLegs.map((leg, index) => ({
    paintPriority: Number(Boolean(leg.selected)) * validLegs.length + index,
    pixels: leg.path.filter(isValidMapCoordinate).map(project),
  }));
  const candidates: ProjectedRoad[] = validLegs.flatMap((leg, index) =>
    (leg.roadSections ?? []).filter((road) => road.name.trim() && road.path.length > 1 && road.path.every(isValidMapCoordinate)).map((road) => {
      const pixels = road.path.map(project);
      const distances = [0];
      for (let index = 1; index < pixels.length; index += 1) {
        distances.push(distances[index - 1] + Math.hypot(pixels[index].x - pixels[index - 1].x, pixels[index].y - pixels[index - 1].y));
      }
      return { road, pixels, paintPriority: Number(Boolean(leg.selected)) * validLegs.length + index, isReturn: Boolean(leg.isReturn), distances, length: distances[distances.length - 1] };
    }));
  candidates.sort((a, b) => b.paintPriority - a.paintPriority || b.length - a.length);
  const limit = Math.max(6, Math.min(32, Math.floor(viewport.width * viewport.height / 24000)));
  const result: RouteRoadLabel[] = [];
  const accepted: Array<{ name: string; center: Pixel }> = [];
  const queues = candidates.map((candidate) => {
    const visual = createRoadLabelVisual(candidate.road.name, candidate.isReturn);
    const spacing = Math.max(LABEL_SPACING, visual.width * 2 + 80);
    const targets: number[] = [];
    for (const interval of visibleIntervals(candidate, viewport)) {
      const start = Math.max(interval.start, visual.width / 2 + 8);
      const end = Math.min(interval.end, candidate.length - visual.width / 2 - 8);
      if (end < start) continue;
      // 以道路起点固定重复相位，平移不让整条道路重新居中排字。
      const first = Math.ceil((start - spacing / 2) / spacing) * spacing + spacing / 2;
      for (let target = first; target <= end && targets.length < 64; target += spacing) targets.push(target);
      if (first > end && targets.length < 64) targets.push((start + end) / 2);
    }
    return { candidate, visual, targets };
  });
  // 先给各条道路一次机会，再增加长路重复标注。
  for (let round = 0; round < 64 && result.length < limit; round += 1) {
    for (const { candidate, visual, targets } of queues) {
      if (round >= targets.length) continue;
      let placement = null;
      // 候选落在弯道时，沿固定相位附近寻找平直位置，不改变重复间距规则。
      for (const offset of [0, 32, -32, 64, -64, 96, -96]) {
        placement = labelPlacement(candidate, targets[round] + offset, visual);
        if (placement) break;
      }
      if (!placement) continue;
      const { center, angle, box } = placement;
      const radians = angle * Math.PI / 180;
      const ends = [-1, 0, 1].map((direction) => ({
        x: center.x + direction * visual.width / 2 * Math.cos(radians),
        y: center.y + direction * visual.width / 2 * Math.sin(radians),
      }));
      if (box.x < VIEWPORT_MARGIN || box.y < VIEWPORT_MARGIN
        || box.x + box.width > viewport.width - VIEWPORT_MARGIN || box.y + box.height > viewport.height - VIEWPORT_MARGIN
        || occupied.some((other) => overlaps(box, other))
        // 不在被更高路线遮住的道路上绘制同色底层，避免往返重合时出现色块。
        || projectedRoutes.some((route) => route.paintPriority > candidate.paintPriority && ends.some((point) => isCoveredByRoute(point, route.pixels)))
        || accepted.some((other) => other.name === candidate.road.name && Math.hypot(other.center.x - center.x, other.center.y - center.y) < LABEL_SPACING - 8)) continue;
      result.push({ name: candidate.road.name, coordinate: center.coordinate, angle, isReturn: candidate.isReturn, visual });
      occupied.push(box);
      accepted.push({ name: candidate.road.name, center });
      if (result.length >= limit) break;
    }
  }
  return result;
}
