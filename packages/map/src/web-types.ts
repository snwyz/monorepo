export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export interface WebMapLocation {
  coordinate: MapCoordinate;
  approximate: boolean;
}

export interface WebMapViewportPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface WebMapFitOptions {
  padding?: WebMapViewportPadding;
  animated?: boolean;
}

export interface WebMapOptions {
  center?: MapCoordinate;
  zoom?: number;
  onDoubleClick?: (coordinate: MapCoordinate) => void;
  onMarkerSelect?: (controlPointId: string) => void;
  onRouteLegSelect?: (routeLegId: string) => void;
  onRouteLegInsert?: (routeLegId: string, coordinate: MapCoordinate) => void;
  onLoading?: () => void;
  onReady?: () => void;
}

export interface WebMapControlPoint extends MapCoordinate {
  id: string;
  name: string;
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

export interface WebMapRouteLegInsertion {
  routeLegId: string;
  from: MapCoordinate;
  to: MapCoordinate;
  coordinate: MapCoordinate;
}

export interface PlaceCandidate {
  id: string;
  name: string;
  address: string;
  coordinate: MapCoordinate;
}

export type DrivingStrategy = "recommend" | "highway" | "avoid-highway";

export type WebMapProvider = "amap" | "tencent";

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
  setRouteLegInsertion(insertion: WebMapRouteLegInsertion | null): void;
  setUserLocation(location: WebMapLocation | null): void;
  setCenter(center: MapCoordinate): void;
  setView(center: MapCoordinate, zoom: number): void;
  containsCoordinates(
    coordinates: MapCoordinate[],
    padding: WebMapViewportPadding,
  ): boolean;
  fitCoordinates(coordinates: MapCoordinate[], options?: WebMapFitOptions): void;
  zoomBy(delta: number): void;
  locate(): Promise<WebMapLocation>;
  destroy(): void;
}

export interface WebMapAdapter {
  readonly provider: WebMapProvider;
  createMap(container: HTMLElement, options?: WebMapOptions): WebMapCanvas;
  resolveInitialLocation(): Promise<MapCoordinate | null>;
  resolveAuthorizedLocation(): Promise<MapCoordinate | null>;
  resolveCurrentLocation(): Promise<WebMapLocation>;
  searchPlaces(keyword: string): Promise<PlaceCandidate[]>;
  reverseGeocode(coordinate: MapCoordinate): Promise<{
    name: string;
    address: string;
  }>;
  calculateClosedDrivingRoute(
    controlPoints: Array<MapCoordinate & { id: string }>,
    strategy: DrivingStrategy,
  ): Promise<ClosedDrivingRoute>;
}

export interface AmapWebAdapterOptions {
  key: string;
  serviceHost?: string;
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

export class AmapWebError extends Error {
  constructor(
    message: string,
    readonly code: "MISSING_KEY" | "LOAD_FAILED" | "SERVICE_FAILED" | "INVALID_RESULT",
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AmapWebError";
  }
}
