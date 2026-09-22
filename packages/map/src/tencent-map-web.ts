import type {
  ClosedDrivingRoute,
  DrivingRouteLeg,
  DrivingStrategy,
  MapCoordinate,
  PlaceCandidate,
  TencentMapWebAdapterOptions,
  WebMapCanvas,
  WebMapControlPoint,
  WebMapAdapter,
  WebMapLocation,
  WebMapOptions,
  WebMapRouteLeg,
} from "./web-types";
import { TencentMapWebError } from "./web-types";

interface TencentLatLng {
  getLat(): number;
  getLng(): number;
}

interface TencentWebServiceLocation {
  lat: number;
  lng: number;
}

interface TencentMapInstance {
  on(event: string, handler: (event: TencentMapEvent) => void): void;
  off(event: string, handler: (event: TencentMapEvent) => void): void;
  setCenter(center: TencentLatLng): void;
  setDoubleClickZoom(enabled: boolean): void;
  setZoom(zoom: number): void;
  getZoom(): number;
  fitBounds(bounds: unknown, options?: { padding?: number }): void;
  destroy(): void;
}

interface TencentMapEvent {
  latLng?: TencentLatLng;
  geometry?: { id?: string };
  originalEvent?: {
    preventDefault?(): void;
    stopPropagation?(): void;
  };
}

interface TencentOverlay {
  on?(event: string, handler: (event: TencentMapEvent) => void): void;
  off?(event: string, handler: (event: TencentMapEvent) => void): void;
  setMap?(map: TencentMapInstance | null): void;
  setGeometries(geometries: unknown[]): void;
}

interface TencentSuggestionItem {
  id?: string;
  title?: string;
  address?: string;
  city?: string;
  district?: string;
  location?: TencentWebServiceLocation;
}

interface TencentDrivingRoute {
  distance?: number;
  duration?: number;
  traffic_light_count?: number;
  polyline?: number[];
}

interface TencentWebServiceResponse {
  status?: number;
  message?: string;
}

interface TencentMapNamespace {
  LatLng: new (latitude: number, longitude: number) => TencentLatLng;
  LatLngBounds: new (southwest: TencentLatLng, northeast: TencentLatLng) => unknown;
  Map: new (
    container: HTMLElement,
    options: Record<string, unknown>,
  ) => TencentMapInstance;
  MarkerStyle: new (options: Record<string, unknown>) => unknown;
  PolylineStyle: new (options: Record<string, unknown>) => unknown;
  MultiMarker: new (options: Record<string, unknown>) => TencentOverlay;
  MultiPolyline: new (options: Record<string, unknown>) => TencentOverlay;
}

declare global {
  interface Window {
    TMap?: TencentMapNamespace;
  }
}

const SDK_ID = "roadbook-tencent-map-web-sdk";
const MAX_PRECISE_LOCATION_ACCURACY_METERS = 50_000;
let sdkPromise: Promise<TencentMapNamespace> | null = null;

function toCoordinate(value: TencentLatLng): MapCoordinate {
  return { latitude: value.getLat(), longitude: value.getLng() };
}

function toWebServiceCoordinate(value: TencentWebServiceLocation): MapCoordinate {
  return { latitude: value.lat, longitude: value.lng };
}

function isValidCoordinate(coordinate: MapCoordinate) {
  return Number.isFinite(coordinate.latitude)
    && Number.isFinite(coordinate.longitude)
    && coordinate.latitude >= -90
    && coordinate.latitude <= 90
    && coordinate.longitude >= -180
    && coordinate.longitude <= 180
    && (Math.abs(coordinate.latitude) > 0.000001
      || Math.abs(coordinate.longitude) > 0.000001);
}

async function requestTencentMapProxy<T extends TencentWebServiceResponse>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json() as T;
  if (!response.ok || (payload.status !== undefined && payload.status !== 0)) {
    throw payload;
  }
  return payload;
}

function decodeTencentPolyline(polyline: number[] | undefined): MapCoordinate[] {
  if (!polyline || polyline.length < 4 || polyline.length % 2 !== 0) return [];
  const decoded = [...polyline];
  for (let index = 2; index < decoded.length; index += 1) {
    decoded[index] = decoded[index - 2] + decoded[index] / 1_000_000;
  }
  const coordinates: MapCoordinate[] = [];
  for (let index = 0; index < decoded.length; index += 2) {
    coordinates.push({
      latitude: decoded[index],
      longitude: decoded[index + 1],
    });
  }
  return coordinates;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function locationDebug(
  level: "info" | "warn" | "error",
  stage: string,
  details: unknown = {},
) {
  if (typeof window === "undefined") return;
  if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
  console[level](`[roadbook/map][location] ${stage}`, details);
}

function debugError(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { value: String(error) };
}

function describeTencentServiceError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const result = error as { message?: unknown; status?: unknown };
    const message = typeof result.message === "string" ? result.message : "服务暂不可用";
    return result.status === undefined ? message : `${message}（状态码 ${String(result.status)}）`;
  }
  return "服务暂不可用";
}

function markerSvg(order: number, active: boolean) {
  const size = active ? 32 : order === 1 ? 30 : 28;
  const fill = order === 1 ? "%230a0a0a" : "%23ffffff";
  const text = order === 1 ? "%23ffffff" : "%230a0a0a";
  const width = active ? 3 : 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${fill}" stroke="%23ffffff" stroke-width="4"/><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 4}" fill="${fill}" stroke="%230a0a0a" stroke-width="${width}"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="${text}" font-family="Arial,sans-serif" font-size="12" font-weight="700">${order}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
}

function locationMarkerSvg() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="%231677ff" fill-opacity=".3"/><circle cx="16" cy="16" r="10" fill="%231677ff" stroke="%23ffffff" stroke-width="2"/></svg>';
  return `data:image/svg+xml,${svg}`;
}

class TencentMapCanvasImpl implements WebMapCanvas {
  private readonly markerLayer: TencentOverlay;
  private readonly userLocationLayer: TencentOverlay;
  private readonly routeOutlineLayer: TencentOverlay;
  private readonly routeLayer: TencentOverlay;
  private readonly onDoubleClick?: (coordinate: MapCoordinate) => void;
  private readonly onMarkerSelect?: (controlPointId: string) => void;
  private readonly onRouteLegSelect?: (routeLegId: string) => void;
  private readonly onLoading?: () => void;
  private readonly onReady?: () => void;

  private readonly mapReadyHandler = () => {
    locationDebug("info", "map:tilesloaded", {
      zoom: this.map.getZoom(),
    });
    this.onReady?.();
  };

  private beginVisualUpdate() {
    locationDebug("info", "map:visual-update-start");
    this.onLoading?.();
  }

  private readonly doubleClickHandler = (event: TencentMapEvent) => {
    event.originalEvent?.preventDefault?.();
    event.originalEvent?.stopPropagation?.();
    if (event.latLng) this.onDoubleClick?.(toCoordinate(event.latLng));
  };

  private readonly markerClickHandler = (event: TencentMapEvent) => {
    if (event.geometry?.id) this.onMarkerSelect?.(event.geometry.id);
  };

  private readonly routeClickHandler = (event: TencentMapEvent) => {
    if (event.geometry?.id) this.onRouteLegSelect?.(event.geometry.id);
  };

  constructor(
    private readonly tmap: TencentMapNamespace,
    private readonly map: TencentMapInstance,
    private readonly resolveCurrentLocation: () => Promise<WebMapLocation>,
    options: WebMapOptions,
  ) {
    this.onDoubleClick = options.onDoubleClick;
    this.onMarkerSelect = options.onMarkerSelect;
    this.onRouteLegSelect = options.onRouteLegSelect;
    this.onLoading = options.onLoading;
    this.onReady = options.onReady;
    this.beginVisualUpdate();
    this.markerLayer = new tmap.MultiMarker({ map, styles: {}, geometries: [] });
    this.routeOutlineLayer = new tmap.MultiPolyline({
      map,
      styles: {
        outline: new tmap.PolylineStyle({
          color: "#ffffff",
          width: 9,
          borderWidth: 0,
        }),
        outlineSelected: new tmap.PolylineStyle({
          color: "#ffffff",
          width: 12,
          borderWidth: 0,
        }),
      },
      geometries: [],
    });
    this.routeLayer = new tmap.MultiPolyline({
      map,
      styles: {
        normal: new tmap.PolylineStyle({
          color: "#0a0a0a",
          width: 5,
          lineCap: "round",
        }),
        selected: new tmap.PolylineStyle({
          color: "#0a0a0a",
          width: 8,
          lineCap: "round",
        }),
        stale: new tmap.PolylineStyle({
          color: "#8a8a8a",
          width: 4,
          dashArray: [8, 6],
        }),
        failed: new tmap.PolylineStyle({
          color: "#b42318",
          width: 5,
          dashArray: [5, 5],
        }),
      },
      geometries: [],
    });
    this.userLocationLayer = new tmap.MultiMarker({
      map,
      styles: {
        loc_icon: new tmap.MarkerStyle({
          width: 32,
          height: 32,
          anchor: { x: 16, y: 16 },
          src: locationMarkerSvg(),
        }),
      },
      geometries: [],
    });
    map.on("dblclick", this.doubleClickHandler);
    map.on("tilesloaded", this.mapReadyHandler);
    this.markerLayer.on?.("click", this.markerClickHandler);
    this.routeLayer.on?.("click", this.routeClickHandler);
  }

  setControlPoints(controlPoints: WebMapControlPoint[]) {
    const styles: Record<string, unknown> = {};
    const geometries = controlPoints.map((point) => {
      const styleId = `point-${point.order}-${point.selected ? "selected" : "normal"}`;
      const size = point.selected ? 32 : point.order === 1 ? 30 : 28;
      styles[styleId] = new this.tmap.MarkerStyle({
        width: size,
        height: size,
        anchor: { x: size / 2, y: size / 2 },
        src: markerSvg(point.order, Boolean(point.selected)),
      });
      return {
        id: point.id,
        styleId,
        position: new this.tmap.LatLng(point.latitude, point.longitude),
      };
    });
    this.markerLayer.setGeometries(geometries);
    const layerWithStyles = this.markerLayer as TencentOverlay & {
      setStyles?: (next: Record<string, unknown>) => void;
    };
    layerWithStyles.setStyles?.(styles);
  }

  setRouteLegs(routeLegs: WebMapRouteLeg[]) {
    const outline = routeLegs
      .filter((leg) => leg.path.length > 1)
      .map((leg) => ({
        id: leg.id,
        styleId: leg.selected ? "outlineSelected" : "outline",
        paths: leg.path.map(
          (point) => new this.tmap.LatLng(point.latitude, point.longitude),
        ),
      }));
    const routes = routeLegs
      .filter((leg) => leg.path.length > 1)
      .map((leg) => ({
        id: leg.id,
        styleId: leg.failed
          ? "failed"
          : leg.stale
            ? "stale"
            : leg.selected
              ? "selected"
              : "normal",
        paths: leg.path.map(
          (point) => new this.tmap.LatLng(point.latitude, point.longitude),
        ),
      }));
    this.routeOutlineLayer.setGeometries(outline);
    this.routeLayer.setGeometries(routes);
  }

  setUserLocation(location: WebMapLocation | null) {
    if (!location || !isValidCoordinate(location.coordinate)) {
      this.userLocationLayer.setGeometries([]);
      locationDebug("info", "map:user-location-cleared");
      return;
    }
    this.userLocationLayer.setGeometries([{
      id: "current-user-location",
      styleId: "loc_icon",
      position: new this.tmap.LatLng(
        location.coordinate.latitude,
        location.coordinate.longitude,
      ),
    }]);
    locationDebug("info", "map:user-location-applied", location);
  }

  setCenter(center: MapCoordinate) {
    if (!isValidCoordinate(center)) {
      locationDebug("error", "map:set-center-rejected", { center });
      return;
    }
    try {
      this.map.setCenter(new this.tmap.LatLng(center.latitude, center.longitude));
      locationDebug("info", "map:set-center-applied", { center });
    } catch (error) {
      locationDebug("error", "map:set-center-failed", {
        center,
        error: debugError(error),
      });
      throw error;
    }
  }

  setView(center: MapCoordinate, zoom: number) {
    if (!isValidCoordinate(center)) {
      locationDebug("error", "map:set-view-rejected", { center, zoom });
      return;
    }
    try {
      this.map.setCenter(new this.tmap.LatLng(center.latitude, center.longitude));
      this.map.setZoom(zoom);
      locationDebug("info", "map:set-view-applied", { center, zoom });
    } catch (error) {
      locationDebug("error", "map:set-view-failed", {
        center,
        zoom,
        error: debugError(error),
      });
      throw error;
    }
  }

  fitCoordinates(coordinates: MapCoordinate[]) {
    if (coordinates.length === 0) return;
    if (coordinates.length === 1) {
      this.map.setCenter(
        new this.tmap.LatLng(coordinates[0].latitude, coordinates[0].longitude),
      );
      this.map.setZoom(13);
      return;
    }
    const latitudes = coordinates.map((point) => point.latitude);
    const longitudes = coordinates.map((point) => point.longitude);
    const southwest = new this.tmap.LatLng(
      Math.min(...latitudes),
      Math.min(...longitudes),
    );
    const northeast = new this.tmap.LatLng(
      Math.max(...latitudes),
      Math.max(...longitudes),
    );
    this.map.fitBounds(new this.tmap.LatLngBounds(southwest, northeast), {
      padding: 96,
    });
  }

  zoomBy(delta: number) {
    this.map.setZoom(this.map.getZoom() + delta);
  }

  async locate() {
    locationDebug("info", "map:locate-clicked");
    const result = await this.resolveCurrentLocation();
    locationDebug("info", "map:location-resolved", result);
    if (!isValidCoordinate(result.coordinate)) {
      locationDebug("error", "map:location-rejected", result);
      throw new TencentMapWebError("定位结果无效", "INVALID_RESULT");
    }
    this.setUserLocation(result);
    const zoom = result.approximate ? 11 : 14;
    try {
      this.map.setCenter(
        new this.tmap.LatLng(
          result.coordinate.latitude,
          result.coordinate.longitude,
        ),
      );
      this.map.setZoom(zoom);
      locationDebug("info", "map:location-applied", {
        ...result,
        zoom,
      });
    } catch (error) {
      locationDebug("error", "map:location-apply-failed", {
        ...result,
        zoom,
        error: debugError(error),
      });
      throw error;
    }
    return result;
  }

  destroy() {
    this.map.off("dblclick", this.doubleClickHandler);
    this.map.off("tilesloaded", this.mapReadyHandler);
    this.markerLayer.off?.("click", this.markerClickHandler);
    this.routeLayer.off?.("click", this.routeClickHandler);
    this.markerLayer.setMap?.(null);
    this.userLocationLayer.setMap?.(null);
    this.routeOutlineLayer.setMap?.(null);
    this.routeLayer.setMap?.(null);
    this.map.destroy();
  }
}

function loadTencentMapSdk(key: string) {
  if (typeof window === "undefined") {
    return Promise.reject(
      new TencentMapWebError("腾讯地图 Web SDK 只能在浏览器中加载", "LOAD_FAILED"),
    );
  }
  if (window.TMap) return Promise.resolve(window.TMap);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<TencentMapNamespace>((resolve, reject) => {
    const existing = document.getElementById(SDK_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    const handleLoad = () => {
      if (window.TMap) resolve(window.TMap);
      else reject(new TencentMapWebError("腾讯地图 SDK 未正确初始化", "LOAD_FAILED"));
    };
    const handleError = (error: unknown) => {
      sdkPromise = null;
      reject(new TencentMapWebError("腾讯地图 SDK 加载失败", "LOAD_FAILED", error));
    };
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (!existing) {
      script.id = SDK_ID;
      script.async = true;
      script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`;
      document.head.appendChild(script);
    }
  });
  return sdkPromise;
}

export class TencentMapWebAdapter implements WebMapAdapter {
  readonly provider = "tencent" as const;
  private searchLocation: MapCoordinate | null = null;
  private preciseLocation: MapCoordinate | null = null;
  private preciseLocationRequest: Promise<MapCoordinate> | null = null;
  private currentLocation: WebMapLocation | null = null;
  private currentLocationRequest: Promise<WebMapLocation> | null = null;
  private drivingRequestQueue: Promise<void> = Promise.resolve();
  private nextDrivingRequestAt = 0;
  private routeCalculationVersion = 0;

  private constructor(private readonly tmap: TencentMapNamespace) {}

  static async create(options: TencentMapWebAdapterOptions) {
    if (!options.key.trim()) {
      throw new TencentMapWebError(
        "缺少 NEXT_PUBLIC_TENCENT_MAP_KEY，地图服务尚未启用",
        "MISSING_KEY",
      );
    }
    return new TencentMapWebAdapter(await loadTencentMapSdk(options.key.trim()));
  }

  createMap(container: HTMLElement, options: WebMapOptions = {}): WebMapCanvas {
    const center = options.center ?? { latitude: 34.3416, longitude: 108.9398 };
    locationDebug("info", "map:create", {
      center,
      zoom: options.zoom ?? 11,
    });
    const map = new this.tmap.Map(container, {
      center: new this.tmap.LatLng(center.latitude, center.longitude),
      zoom: options.zoom ?? 11,
      pitch: 0,
      rotation: 0,
      viewMode: "2D",
      showControl: false,
    });
    map.setDoubleClickZoom(false);
    return new TencentMapCanvasImpl(
      this.tmap,
      map,
      () => this.resolveCurrentLocation(),
      options,
    );
  }

  async resolveInitialLocation(): Promise<MapCoordinate | null> {
    locationDebug("info", "initial:ip-start");
    try {
      const ipLocation = await this.getIpLocation();
      if (!ipLocation) {
        locationDebug("warn", "initial:ip-empty");
        return null;
      }
      this.searchLocation = ipLocation;
      this.currentLocation = { coordinate: ipLocation, approximate: true };
      locationDebug("info", "initial:ip-success", { coordinate: ipLocation });
      return ipLocation;
    } catch (error) {
      locationDebug("error", "initial:ip-failed", { error: debugError(error) });
      return null;
    }
  }

  async resolveAuthorizedLocation(): Promise<MapCoordinate | null> {
    if (!await this.hasGrantedLocationPermission()) {
      locationDebug("info", "authorized:skip-not-granted");
      return null;
    }
    locationDebug("info", "authorized:precise-start");
    try {
      const coordinate = await this.getPreciseLocation();
      this.currentLocation = { coordinate, approximate: false };
      locationDebug("info", "authorized:precise-success", { coordinate });
      return coordinate;
    } catch (error) {
      locationDebug("error", "authorized:precise-failed", {
        error: debugError(error),
      });
      return null;
    }
  }

  async searchPlaces(keyword: string): Promise<PlaceCandidate[]> {
    const query = keyword.trim();
    if (!query) return [];
    try {
      const params = new URLSearchParams({ q: query });
      if (this.searchLocation) {
        params.set(
          "location",
          `${this.searchLocation.latitude},${this.searchLocation.longitude}`,
        );
      }
      const response = await requestTencentMapProxy<TencentWebServiceResponse & {
        data?: TencentSuggestionItem[];
        result?: { data?: TencentSuggestionItem[] };
      }>(`/api/tencent-map/suggestion?${params.toString()}`);
      const data = response.data ?? response.result?.data ?? [];
      return data.flatMap((item, index) => {
        if (!item.location) return [];
        return [{
          id: item.id ?? `${query}-${index}`,
          name: item.title ?? "未命名地点",
          address: item.address || [item.city, item.district].filter(Boolean).join(" · ") || "地址暂缺",
          coordinate: toWebServiceCoordinate(item.location),
        }];
      });
    } catch (error) {
      const detail = describeTencentServiceError(error);
      throw new TencentMapWebError(`地点搜索失败：${detail}`, "SERVICE_FAILED", error);
    }
  }

  async reverseGeocode(coordinate: MapCoordinate) {
    try {
      const params = new URLSearchParams({
        location: `${coordinate.latitude},${coordinate.longitude}`,
      });
      const response = await requestTencentMapProxy<TencentWebServiceResponse & {
        result?: {
          address?: string;
          formatted_addresses?: { recommend?: string };
        };
      }>(`/api/tencent-map/reverse-geocode?${params.toString()}`);
      const result = response.result;
      return {
        name: result?.formatted_addresses?.recommend || result?.address || "地图选点",
        address: result?.address || "未识别地址",
      };
    } catch {
      return { name: "地图选点", address: "未识别地址" };
    }
  }

  async calculateClosedDrivingRoute(
    controlPoints: Array<MapCoordinate & { id: string }>,
    strategy: DrivingStrategy,
  ): Promise<ClosedDrivingRoute> {
    if (controlPoints.length < 2) {
      throw new TencentMapWebError("至少需要两个控制点", "INVALID_RESULT");
    }
    const policyByStrategy: Record<DrivingStrategy, string> = {
      recommend: "LEAST_TIME,REAL_TRAFFIC",
      highway: "LEAST_TIME,REAL_TRAFFIC",
      "avoid-highway": "LEAST_TIME,AVOID_HIGHWAY",
    };
    const calculationVersion = ++this.routeCalculationVersion;
    const connections = controlPoints.map((from, index) => ({
      from,
      to: controlPoints[(index + 1) % controlPoints.length],
      index,
    }));

    try {
      const legs: DrivingRouteLeg[] = [];
      for (const { from, to, index } of connections) {
        if (calculationVersion !== this.routeCalculationVersion) {
          throw new Error("路线计算已被更新");
        }
        const params = new URLSearchParams({
          from: `${from.latitude},${from.longitude}`,
          to: `${to.latitude},${to.longitude}`,
          policy: policyByStrategy[strategy],
        });
        const response = await this.scheduleDrivingRequest(() =>
          requestTencentMapProxy<TencentWebServiceResponse & {
            result?: { routes?: TencentDrivingRoute[] };
          }>(`/api/tencent-map/driving?${params.toString()}`),
        );
        const route = response.result?.routes?.[0];
        if (!route) {
          throw new Error(`第 ${index + 1} 段没有返回路线`);
        }
        const path = decodeTencentPolyline(route.polyline);
        if (path.length < 2) {
          throw new Error(`第 ${index + 1} 段没有返回有效路线`);
        }
        legs.push({
          id: `${from.id}:${to.id}`,
          fromControlPointId: from.id,
          toControlPointId: to.id,
          distanceMeters: route.distance ?? 0,
          durationMinutes: route.duration ?? 0,
          trafficLightCount: route.traffic_light_count ?? null,
          path,
        });
      }
      const lightCounts = legs.map((leg) => leg.trafficLightCount);
      return {
        strategy,
        legs,
        distanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
        durationMinutes: legs.reduce((sum, leg) => sum + leg.durationMinutes, 0),
        trafficLightCount: lightCounts.every((value) => value !== null)
          ? lightCounts.reduce<number>((sum, value) => sum + (value ?? 0), 0)
          : null,
      };
    } catch (error) {
      const detail = describeTencentServiceError(error)
        .replace(/^闭合路线计算失败[：:]\s*/, "");
      throw new TencentMapWebError(
        `闭合路线计算失败：${detail}`,
        "SERVICE_FAILED",
        error,
      );
    }
  }

  private async resolveCurrentLocation(): Promise<WebMapLocation> {
    if (this.currentLocation && !this.currentLocation.approximate) {
      locationDebug("info", "locate:cache-hit-precise", this.currentLocation);
      return this.currentLocation;
    }
    if (this.currentLocationRequest) {
      locationDebug("info", "locate:reuse-pending-request");
      return this.currentLocationRequest;
    }
    const approximateFallback = this.currentLocation?.approximate
      ? this.currentLocation
      : null;
    if (approximateFallback) {
      locationDebug("info", "locate:approximate-fallback-retained", approximateFallback);
    }
    locationDebug("info", "locate:precise-start");
    const request = (async () => {
      try {
        const coordinate = await this.getPreciseLocation();
        locationDebug("info", "locate:precise-success", { coordinate });
        return { coordinate, approximate: false };
      } catch (error) {
        locationDebug("warn", "locate:precise-fallback", {
          error: debugError(error),
        });
        if (approximateFallback) {
          locationDebug(
            "info",
            "locate:approximate-fallback-used",
            approximateFallback,
          );
          return approximateFallback;
        }
        const coordinate = await this.getIpLocation();
        if (coordinate) {
          locationDebug("info", "locate:ip-fallback-success", { coordinate });
          return { coordinate, approximate: true };
        }
        locationDebug("error", "locate:ip-fallback-empty");
        throw error;
      }
    })()
      .then((result) => {
        this.currentLocation = result;
        return result;
      })
      .finally(() => {
        this.currentLocationRequest = null;
      });
    this.currentLocationRequest = request;
    return request;
  }

  private async hasGrantedLocationPermission() {
    if (!navigator.permissions) {
      locationDebug("warn", "permission:api-unavailable");
      return false;
    }
    try {
      const permission = await navigator.permissions.query({ name: "geolocation" });
      locationDebug("info", "permission:state", { state: permission.state });
      return permission.state === "granted";
    } catch (error) {
      locationDebug("error", "permission:query-failed", {
        error: debugError(error),
      });
      return false;
    }
  }

  private getPreciseLocation() {
    if (this.preciseLocation) {
      locationDebug("info", "geolocation:cache-hit", {
        coordinate: this.preciseLocation,
      });
      return Promise.resolve(this.preciseLocation);
    }
    if (this.preciseLocationRequest) {
      locationDebug("info", "geolocation:reuse-pending-request");
      return this.preciseLocationRequest;
    }
    if (!navigator.geolocation) {
      locationDebug("error", "geolocation:api-unavailable");
      return Promise.reject(
        new TencentMapWebError("当前浏览器不支持定位", "SERVICE_FAILED"),
      );
    }
    locationDebug("info", "geolocation:request-start", {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0,
    });
    const request = new Promise<MapCoordinate>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        locationDebug("warn", "geolocation:application-timeout");
        reject(new TencentMapWebError("获取当前位置超时", "SERVICE_FAILED"));
      }, 8000);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (settled) {
            locationDebug("warn", "geolocation:late-success-ignored", {
              timestamp: position.timestamp,
            });
            return;
          }
          settled = true;
          window.clearTimeout(timeout);
          const accuracy = position.coords.accuracy;
          const coordinate = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          locationDebug("info", "geolocation:success-callback", {
            coordinate,
            accuracy,
            timestamp: position.timestamp,
          });
          if (!isValidCoordinate(coordinate)) {
            locationDebug("error", "geolocation:invalid-coordinate", { coordinate });
            reject(new TencentMapWebError("浏览器返回了无效位置", "INVALID_RESULT"));
            return;
          }
          if (
            !Number.isFinite(accuracy)
            || accuracy > MAX_PRECISE_LOCATION_ACCURACY_METERS
          ) {
            locationDebug("warn", "geolocation:accuracy-rejected", {
              coordinate,
              accuracy,
              maximumAccuracy: MAX_PRECISE_LOCATION_ACCURACY_METERS,
            });
            reject(new TencentMapWebError(
              "浏览器定位精度过低，继续使用 IP 定位",
              "INVALID_RESULT",
            ));
            return;
          }
          resolve(coordinate);
        },
        (error) => {
          if (settled) {
            locationDebug("warn", "geolocation:late-error-ignored", {
              code: error.code,
              message: error.message,
            });
            return;
          }
          settled = true;
          window.clearTimeout(timeout);
          locationDebug("error", "geolocation:error-callback", {
            code: error.code,
            message: error.message,
          });
          reject(new TencentMapWebError(
            error.code === error.PERMISSION_DENIED
              ? "定位权限未授权"
              : error.code === error.TIMEOUT
                ? "获取当前位置超时"
                : "无法获取当前位置",
            "SERVICE_FAILED",
            error,
          ));
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
      );
    })
      .then(async (coordinate) => {
        locationDebug("info", "coordinate-translate:start", { coordinate });
        const params = new URLSearchParams({
          location: `${coordinate.latitude},${coordinate.longitude}`,
        });
        try {
          const response = await requestTencentMapProxy<TencentWebServiceResponse & {
            locations?: TencentWebServiceLocation[];
          }>(`/api/tencent-map/coordinate-translate?${params.toString()}`);
          const translated = response.locations?.[0]
            ? toWebServiceCoordinate(response.locations[0])
            : coordinate;
          const normalized = isValidCoordinate(translated) ? translated : coordinate;
          locationDebug("info", "coordinate-translate:success", {
            source: coordinate,
            translated,
            normalized,
          });
          this.preciseLocation = normalized;
          this.searchLocation = normalized;
          return normalized;
        } catch (error) {
          locationDebug("warn", "coordinate-translate:fallback-source", {
            coordinate,
            error: debugError(error),
          });
          this.preciseLocation = coordinate;
          this.searchLocation = coordinate;
          return coordinate;
        }
      })
      .finally(() => {
        this.preciseLocationRequest = null;
      });
    this.preciseLocationRequest = request;
    return request;
  }

  private async getIpLocation() {
    locationDebug("info", "ip-location:request-start");
    const response = await requestTencentMapProxy<TencentWebServiceResponse & {
      result?: { location?: TencentWebServiceLocation };
    }>("/api/tencent-map/ip-location");
    if (!response.result?.location) {
      locationDebug("warn", "ip-location:empty", { response });
      return null;
    }
    const coordinate = toWebServiceCoordinate(response.result.location);
    if (!isValidCoordinate(coordinate)) {
      locationDebug("error", "ip-location:invalid-coordinate", { coordinate });
      return null;
    }
    locationDebug("info", "ip-location:success", { coordinate });
    return coordinate;
  }

  private scheduleDrivingRequest<T>(operation: () => Promise<T>) {
    const scheduled = this.drivingRequestQueue.then(async () => {
      const remaining = this.nextDrivingRequestAt - Date.now();
      if (remaining > 0) await wait(remaining);
      this.nextDrivingRequestAt = Date.now() + 650;
      return operation();
    });
    this.drivingRequestQueue = scheduled.then(() => undefined, () => undefined);
    return scheduled;
  }
}
