import type {
  MapCoordinate,
  WebMapViewportPadding,
} from "./web-types";

interface WebMapViewportState {
  center: MapCoordinate;
  zoom: number;
  width: number;
  height: number;
}

const TILE_SIZE = 256;
const MAX_MERCATOR_LATITUDE = 85.05112878;

function projectCoordinate(coordinate: MapCoordinate, worldSize: number) {
  const latitude = Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, coordinate.latitude),
  );
  const sine = Math.sin(latitude * Math.PI / 180);
  return {
    x: (coordinate.longitude + 180) / 360 * worldSize,
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * worldSize,
  };
}

function wrappedHorizontalDelta(value: number, center: number, worldSize: number) {
  let delta = value - center;
  if (delta > worldSize / 2) delta -= worldSize;
  if (delta < -worldSize / 2) delta += worldSize;
  return delta;
}

export function areCoordinatesInsideViewport(
  coordinates: MapCoordinate[],
  viewport: WebMapViewportState,
  padding: WebMapViewportPadding,
) {
  if (
    coordinates.length === 0
    || viewport.width <= padding.left + padding.right
    || viewport.height <= padding.top + padding.bottom
  ) return false;

  const worldSize = TILE_SIZE * 2 ** viewport.zoom;
  const projectedCenter = projectCoordinate(viewport.center, worldSize);
  const left = -viewport.width / 2 + padding.left;
  const right = viewport.width / 2 - padding.right;
  const top = -viewport.height / 2 + padding.top;
  const bottom = viewport.height / 2 - padding.bottom;

  return coordinates.every((coordinate) => {
    const projected = projectCoordinate(coordinate, worldSize);
    const x = wrappedHorizontalDelta(projected.x, projectedCenter.x, worldSize);
    const y = projected.y - projectedCenter.y;
    return x >= left && x <= right && y >= top && y <= bottom;
  });
}
