import type { RouteTravelMode } from "@roadbook/map/web";

export function parseRouteCoordinate(value: string | null): [number, number] | null {
  if (!value || !/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(value)) return null;
  const [latitude, longitude] = value.split(",").map(Number);
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    ? [latitude, longitude] : null;
}

export function parseRouteTravelMode(value: string | null): RouteTravelMode | null {
  return value === "driving" || value === "cycling" || value === "walking" ? value : null;
}
