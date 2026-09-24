import type { MapCoordinate } from "@roadbook/map/web";

export type FeaturedRoadCode = "G219" | "G331" | "G228";
export type FeaturedRoadStyle = "g219" | "g331" | "g228";
export type FeaturedRouteControlPointKind = "county-city" | "port" | "scenic";

export interface FeaturedRouteRoad {
  id: string;
  code: FeaturedRoadCode;
  style: FeaturedRoadStyle;
  path: MapCoordinate[];
  labelPoints: MapCoordinate[];
}

export interface FeaturedRouteControlPoint extends MapCoordinate {
  id: string;
  name: string;
  region: string;
  roadCode: FeaturedRoadCode;
  kind: FeaturedRouteControlPointKind;
}

export interface FeaturedDrivingRoute {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  previewImageSrc: string;
  estimatedDistanceKilometers: number;
  keywords: string[];
  roadCodes: FeaturedRoadCode[];
  roads: FeaturedRouteRoad[];
  controlPoints: FeaturedRouteControlPoint[];
  dataNotice: string;
}

export interface FeaturedRouteUserMarker extends MapCoordinate {
  id: string;
  routeId: string;
  name: string;
  address: string;
  createdAt: string;
}

export interface FeaturedRouteCategory {
  id: string;
  label: string;
  query: string;
  count: number;
}

export const FEATURED_ROUTE_MARKER_LIMIT = 20;
