export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export interface WebMapLocation {
  coordinate: MapCoordinate;
  approximate: boolean;
}

export interface WebMapOptions {
  center?: MapCoordinate;
  zoom?: number;
  onDoubleClick?: (coordinate: MapCoordinate) => void;
  onMarkerSelect?: (controlPointId: string) => void;
  onRouteLegSelect?: (routeLegId: string) => void;
  onLoading?: () => void;
  onReady?: () => void;
}

export interface WebMapControlPoint extends MapCoordinate {
  id: string;
  order: number;
  selected?: boolean;
}

export interface WebMapRouteLeg {
  id: string;
  path: MapCoordinate[];
  selected?: boolean;
  stale?: boolean;
  failed?: boolean;
}

export interface PlaceCandidate {
  id: string;
  name: string;
  address: string;
  coordinate: MapCoordinate;
}

export type DrivingStrategy = "recommend" | "highway" | "avoid-highway";

export interface DrivingRouteLeg {
  id: string;
  fromControlPointId: string;
  toControlPointId: string;
  distanceMeters: number;
  durationMinutes: number;
  trafficLightCount: number | null;
  path: MapCoordinate[];
}

export interface ClosedDrivingRoute {
  strategy: DrivingStrategy;
  legs: DrivingRouteLeg[];
  distanceMeters: number;
  durationMinutes: number;
  trafficLightCount: number | null;
}

export interface WebMapCanvas {
  setControlPoints(controlPoints: WebMapControlPoint[]): void;
  setRouteLegs(routeLegs: WebMapRouteLeg[]): void;
  setUserLocation(location: WebMapLocation | null): void;
  setCenter(center: MapCoordinate): void;
  setView(center: MapCoordinate, zoom: number): void;
  fitCoordinates(coordinates: MapCoordinate[]): void;
  zoomBy(delta: number): void;
  locate(): Promise<WebMapLocation>;
  destroy(): void;
}

export interface TencentMapWebAdapterOptions {
  key: string;
}

export class TencentMapWebError extends Error {
  constructor(
    message: string,
    readonly code: "MISSING_KEY" | "LOAD_FAILED" | "SERVICE_FAILED" | "INVALID_RESULT",
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "TencentMapWebError";
  }
}
