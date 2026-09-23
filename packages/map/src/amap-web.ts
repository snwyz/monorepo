import type {
  AmapWebAdapterOptions,
  ClosedDrivingRoute,
  DrivingRouteLeg,
  DrivingStrategy,
  MapCoordinate,
  PlaceCandidate,
  WebMapAdapter,
  WebMapCanvas,
  WebMapControlPoint,
  WebMapLocation,
  WebMapOptions,
  WebMapRouteLeg,
} from "./web-types";
import { AmapWebError } from "./web-types";

type AmapPosition = [number, number];

interface AmapLngLat {
  getLat(): number;
  getLng(): number;
}

interface AmapMapEvent {
  lnglat?: AmapLngLat;
  originEvent?: {
    preventDefault?(): void;
    stopPropagation?(): void;
  };
}

interface AmapEventTarget {
  on(event: string, handler: (event: AmapMapEvent) => void): void;
  off(event: string, handler: (event: AmapMapEvent) => void): void;
}

interface AmapOverlay extends AmapEventTarget {
  setMap(map: AmapMapInstance | null): void;
}

interface AmapMapInstance extends AmapEventTarget {
  add(overlays: AmapOverlay | AmapOverlay[]): void;
  setCenter(center: AmapPosition): void;
  setZoom(zoom: number): void;
  getZoom(): number;
  setBounds(bounds: unknown): void;
  setStatus(status: Record<string, boolean>): void;
  destroy(): void;
}

interface AmapNamespace {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AmapMapInstance;
  Marker: new (options: Record<string, unknown>) => AmapOverlay;
  Polyline: new (options: Record<string, unknown>) => AmapOverlay;
  Bounds: new (southwest: AmapPosition, northeast: AmapPosition) => unknown;
}

interface AmapServiceResponse {
  status?: string;
  info?: string;
  infocode?: string;
}

interface AmapInputTip {
  id?: string;
  name?: string;
  district?: string;
  address?: string | string[];
  location?: string | string[];
}

interface AmapDrivingPath {
  distance?: string;
  duration?: string;
  traffic_lights?: string;
  steps?: Array<{ polyline?: string }>;
}

declare global {
  interface Window {
    AMap?: AmapNamespace;
    _AMapSecurityConfig?: {
      serviceHost?: string;
      securityJsCode?: string;
    };
  }
}

const SDK_ID = "roadbook-amap-web-sdk";
const DEFAULT_CENTER: MapCoordinate = { latitude: 34.3416, longitude: 108.9398 };
const MAX_PRECISE_LOCATION_ACCURACY_METERS = 50_000;
let sdkPromise: Promise<AmapNamespace> | null = null;

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

function toPosition(coordinate: MapCoordinate): AmapPosition {
  return [coordinate.longitude, coordinate.latitude];
}

function toCoordinate(value: AmapLngLat): MapCoordinate {
  return { latitude: value.getLat(), longitude: value.getLng() };
}

function parseCoordinate(value: unknown): MapCoordinate | null {
  if (typeof value !== "string") return null;
  const [longitudeText, latitudeText] = value.split(",");
  const coordinate = {
    latitude: Number(latitudeText),
    longitude: Number(longitudeText),
  };
  return isValidCoordinate(coordinate) ? coordinate : null;
}

function decodePolyline(value: string | undefined): MapCoordinate[] {
  if (!value) return [];
  return value.split(";").flatMap((item) => {
    const coordinate = parseCoordinate(item);
    return coordinate ? [coordinate] : [];
  });
}

function combineStepPolylines(steps: AmapDrivingPath["steps"]) {
  const path: MapCoordinate[] = [];
  for (const step of steps ?? []) {
    for (const coordinate of decodePolyline(step.polyline)) {
      const previous = path[path.length - 1];
      if (
        previous
        && previous.latitude === coordinate.latitude
        && previous.longitude === coordinate.longitude
      ) {
        continue;
      }
      path.push(coordinate);
    }
  }
  return path;
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
  console[level](`[roadbook/map][amap-location] ${stage}`, details);
}

function debugError(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { value: String(error) };
}

function describeAmapServiceError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const result = error as { info?: unknown; infocode?: unknown };
    const message = typeof result.info === "string" ? result.info : "服务暂不可用";
    return result.infocode === undefined
      ? message
      : `${message}（状态码 ${String(result.infocode)}）`;
  }
  return "服务暂不可用";
}

async function requestAmapProxy<T extends AmapServiceResponse>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json() as T;
  if (!response.ok || (payload.status !== undefined && payload.status !== "1")) {
    throw payload;
  }
  return payload;
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

function markerContent(source: string, size: number) {
  const container = document.createElement("div");
  container.style.width = `${size}px`;
  container.style.height = `${size}px`;
  container.style.pointerEvents = "none";

  const image = document.createElement("img");
  image.src = source;
  image.alt = "";
  image.width = size;
  image.height = size;
  image.draggable = false;
  image.style.display = "block";
  image.style.width = "100%";
  image.style.height = "100%";
  image.style.maxWidth = "none";
  image.style.pointerEvents = "none";
  container.appendChild(image);
  return container;
}

interface InteractiveOverlay {
  overlay: AmapOverlay;
  handler: (event: AmapMapEvent) => void;
}

class AmapCanvasImpl implements WebMapCanvas {
  private controlPointOverlays: InteractiveOverlay[] = [];
  private routeOutlineOverlays: AmapOverlay[] = [];
  private routeOverlays: InteractiveOverlay[] = [];
  private userLocationOverlay: AmapOverlay | null = null;
  private readonly onDoubleClick?: (coordinate: MapCoordinate) => void;
  private readonly onMarkerSelect?: (controlPointId: string) => void;
  private readonly onRouteLegSelect?: (routeLegId: string) => void;
  private readonly onReady?: () => void;

  private readonly mapReadyHandler = () => {
    locationDebug("info", "map:complete", { zoom: this.map.getZoom() });
    this.onReady?.();
  };

  private readonly doubleClickHandler = (event: AmapMapEvent) => {
    event.originEvent?.preventDefault?.();
    event.originEvent?.stopPropagation?.();
    if (event.lnglat) this.onDoubleClick?.(toCoordinate(event.lnglat));
  };

  constructor(
    private readonly amap: AmapNamespace,
    private readonly map: AmapMapInstance,
    private readonly resolveCurrentLocation: () => Promise<WebMapLocation>,
    options: WebMapOptions,
  ) {
    this.onDoubleClick = options.onDoubleClick;
    this.onMarkerSelect = options.onMarkerSelect;
    this.onRouteLegSelect = options.onRouteLegSelect;
    this.onReady = options.onReady;
    options.onLoading?.();
    map.setStatus({ doubleClickZoom: false });
    map.on("dblclick", this.doubleClickHandler);
    map.on("complete", this.mapReadyHandler);
  }

  setControlPoints(controlPoints: WebMapControlPoint[]) {
    this.clearInteractiveOverlays(this.controlPointOverlays);
    this.controlPointOverlays = controlPoints.map((point) => {
      const size = point.selected ? 32 : point.order === 1 ? 30 : 28;
      const marker = new this.amap.Marker({
        position: toPosition(point),
        content: markerContent(markerSvg(point.order, Boolean(point.selected)), size),
        anchor: "center",
        zIndex: point.selected ? 130 : 120,
      });
      const handler = () => this.onMarkerSelect?.(point.id);
      marker.on("click", handler);
      this.map.add(marker);
      return { overlay: marker, handler };
    });
  }

  setRouteLegs(routeLegs: WebMapRouteLeg[]) {
    this.clearOverlays(this.routeOutlineOverlays);
    this.clearInteractiveOverlays(this.routeOverlays);
    const validLegs = routeLegs.filter((leg) => leg.path.length > 1);
    this.routeOutlineOverlays = validLegs.map((leg) => {
      const outline = new this.amap.Polyline({
        path: leg.path.map(toPosition),
        strokeColor: "#ffffff",
        strokeWeight: leg.selected ? 12 : 9,
        strokeOpacity: 1,
        lineJoin: "round",
        lineCap: "round",
        zIndex: 40,
      });
      this.map.add(outline);
      return outline;
    });
    this.routeOverlays = validLegs.map((leg) => {
      const route = new this.amap.Polyline({
        path: leg.path.map(toPosition),
        strokeColor: leg.failed ? "#b42318" : leg.stale ? "#8a8a8a" : "#0a0a0a",
        strokeWeight: leg.selected ? 8 : leg.stale ? 4 : 5,
        strokeStyle: leg.failed || leg.stale ? "dashed" : "solid",
        strokeDasharray: leg.failed ? [5, 5] : [8, 6],
        strokeOpacity: 1,
        lineJoin: "round",
        lineCap: "round",
        zIndex: leg.selected ? 70 : 60,
      });
      const handler = () => this.onRouteLegSelect?.(leg.id);
      route.on("click", handler);
      this.map.add(route);
      return { overlay: route, handler };
    });
  }

  setUserLocation(location: WebMapLocation | null) {
    this.userLocationOverlay?.setMap(null);
    this.userLocationOverlay = null;
    if (!location || !isValidCoordinate(location.coordinate)) return;
    const marker = new this.amap.Marker({
      position: toPosition(location.coordinate),
      content: markerContent(locationMarkerSvg(), 32),
      anchor: "center",
      zIndex: 110,
    });
    this.map.add(marker);
    this.userLocationOverlay = marker;
  }

  setCenter(center: MapCoordinate) {
    if (isValidCoordinate(center)) this.map.setCenter(toPosition(center));
  }

  setView(center: MapCoordinate, zoom: number) {
    if (!isValidCoordinate(center)) return;
    this.map.setCenter(toPosition(center));
    this.map.setZoom(zoom);
  }

  fitCoordinates(coordinates: MapCoordinate[]) {
    const validCoordinates = coordinates.filter(isValidCoordinate);
    if (validCoordinates.length === 0) return;
    if (validCoordinates.length === 1) {
      this.setView(validCoordinates[0], 13);
      return;
    }
    const latitudes = validCoordinates.map((point) => point.latitude);
    const longitudes = validCoordinates.map((point) => point.longitude);
    this.map.setBounds(new this.amap.Bounds(
      [Math.min(...longitudes), Math.min(...latitudes)],
      [Math.max(...longitudes), Math.max(...latitudes)],
    ));
  }

  zoomBy(delta: number) {
    this.map.setZoom(this.map.getZoom() + delta);
  }

  async locate() {
    const result = await this.resolveCurrentLocation();
    if (!isValidCoordinate(result.coordinate)) {
      throw new AmapWebError("定位结果无效", "INVALID_RESULT");
    }
    this.setUserLocation(result);
    this.setView(result.coordinate, result.approximate ? 11 : 14);
    return result;
  }

  destroy() {
    this.map.off("dblclick", this.doubleClickHandler);
    this.map.off("complete", this.mapReadyHandler);
    this.clearInteractiveOverlays(this.controlPointOverlays);
    this.clearOverlays(this.routeOutlineOverlays);
    this.clearInteractiveOverlays(this.routeOverlays);
    this.userLocationOverlay?.setMap(null);
    this.userLocationOverlay = null;
    this.map.destroy();
  }

  private clearOverlays(overlays: AmapOverlay[]) {
    for (const overlay of overlays) overlay.setMap(null);
  }

  private clearInteractiveOverlays(overlays: InteractiveOverlay[]) {
    for (const { overlay, handler } of overlays) {
      overlay.off("click", handler);
      overlay.setMap(null);
    }
  }
}

function loadAmapSdk(options: AmapWebAdapterOptions) {
  if (typeof window === "undefined") {
    return Promise.reject(
      new AmapWebError("高德地图 Web SDK 只能在浏览器中加载", "LOAD_FAILED"),
    );
  }
  if (window.AMap) return Promise.resolve(window.AMap);
  if (sdkPromise) return sdkPromise;

  window._AMapSecurityConfig = {
    serviceHost: options.serviceHost ?? `${window.location.origin}/_AMapService`,
  };
  sdkPromise = new Promise<AmapNamespace>((resolve, reject) => {
    const existing = document.getElementById(SDK_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    const handleLoad = () => {
      if (window.AMap) resolve(window.AMap);
      else reject(new AmapWebError("高德地图 SDK 未正确初始化", "LOAD_FAILED"));
    };
    const handleError = (error: unknown) => {
      sdkPromise = null;
      reject(new AmapWebError("高德地图 SDK 加载失败", "LOAD_FAILED", error));
    };
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (!existing) {
      script.id = SDK_ID;
      script.async = true;
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(options.key)}`;
      document.head.appendChild(script);
    }
  });
  return sdkPromise;
}

export class AmapWebAdapter implements WebMapAdapter {
  readonly provider = "amap" as const;
  private searchLocation: MapCoordinate | null = null;
  private preciseLocation: MapCoordinate | null = null;
  private preciseLocationRequest: Promise<MapCoordinate> | null = null;
  private currentLocation: WebMapLocation | null = null;
  private currentLocationRequest: Promise<WebMapLocation> | null = null;
  private drivingRequestQueue: Promise<void> = Promise.resolve();
  private nextDrivingRequestAt = 0;
  private routeCalculationVersion = 0;

  private constructor(private readonly amap: AmapNamespace) {}

  static async create(options: AmapWebAdapterOptions) {
    if (!options.key.trim()) {
      throw new AmapWebError(
        "缺少 NEXT_PUBLIC_AMAP_KEY，高德地图服务尚未启用",
        "MISSING_KEY",
      );
    }
    return new AmapWebAdapter(await loadAmapSdk({
      ...options,
      key: options.key.trim(),
    }));
  }

  createMap(container: HTMLElement, options: WebMapOptions = {}): WebMapCanvas {
    const center = options.center ?? DEFAULT_CENTER;
    const map = new this.amap.Map(container, {
      center: toPosition(center),
      zoom: options.zoom ?? 11,
      viewMode: "2D",
      pitch: 0,
      rotation: 0,
      doubleClickZoom: false,
      showLabel: true,
    });
    return new AmapCanvasImpl(
      this.amap,
      map,
      () => this.resolveCurrentLocation(),
      options,
    );
  }

  async resolveInitialLocation(): Promise<MapCoordinate | null> {
    try {
      const coordinate = await this.getIpLocation();
      if (!coordinate) return null;
      this.searchLocation = coordinate;
      this.currentLocation = { coordinate, approximate: true };
      return coordinate;
    } catch (error) {
      locationDebug("warn", "initial:ip-failed", { error: debugError(error) });
      return null;
    }
  }

  async resolveAuthorizedLocation(): Promise<MapCoordinate | null> {
    if (!await this.hasGrantedLocationPermission()) return null;
    try {
      const coordinate = await this.getPreciseLocation();
      this.currentLocation = { coordinate, approximate: false };
      return coordinate;
    } catch (error) {
      locationDebug("warn", "authorized:precise-failed", { error: debugError(error) });
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
      const response = await requestAmapProxy<AmapServiceResponse & {
        tips?: AmapInputTip[];
      }>(`/api/amap/suggestion?${params.toString()}`);
      return (response.tips ?? []).flatMap((item, index) => {
        const coordinate = parseCoordinate(item.location);
        if (!coordinate) return [];
        const address = typeof item.address === "string" ? item.address : "";
        return [{
          id: item.id || `${query}-${index}`,
          name: item.name || "未命名地点",
          address: address || item.district || "地址暂缺",
          coordinate,
        }];
      });
    } catch (error) {
      throw new AmapWebError(
        `地点搜索失败：${describeAmapServiceError(error)}`,
        "SERVICE_FAILED",
        error,
      );
    }
  }

  async reverseGeocode(coordinate: MapCoordinate) {
    try {
      const params = new URLSearchParams({
        location: `${coordinate.latitude},${coordinate.longitude}`,
      });
      const response = await requestAmapProxy<AmapServiceResponse & {
        regeocode?: {
          formatted_address?: string;
          addressComponent?: {
            township?: string;
            streetNumber?: { street?: string; number?: string };
          };
        };
      }>(`/api/amap/reverse-geocode?${params.toString()}`);
      const result = response.regeocode;
      const street = [
        result?.addressComponent?.streetNumber?.street,
        result?.addressComponent?.streetNumber?.number,
      ].filter(Boolean).join("");
      const address = result?.formatted_address || "未识别地址";
      return {
        name: street || result?.addressComponent?.township || address || "地图选点",
        address,
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
      throw new AmapWebError("至少需要两个控制点", "INVALID_RESULT");
    }
    const strategyCode: Record<DrivingStrategy, string> = {
      recommend: "10",
      highway: "20",
      "avoid-highway": "13",
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
          strategy: strategyCode[strategy],
        });
        const response = await this.scheduleDrivingRequest(() =>
          requestAmapProxy<AmapServiceResponse & {
            route?: { paths?: AmapDrivingPath[] };
          }>(`/api/amap/driving?${params.toString()}`),
        );
        const route = response.route?.paths?.[0];
        if (!route) throw new Error(`第 ${index + 1} 段没有返回路线`);
        const path = combineStepPolylines(route.steps);
        if (path.length < 2) {
          throw new Error(`第 ${index + 1} 段没有返回有效路线`);
        }
        const durationSeconds = Number(route.duration);
        const trafficLightCount = Number(route.traffic_lights);
        legs.push({
          id: `${from.id}:${to.id}`,
          fromControlPointId: from.id,
          toControlPointId: to.id,
          distanceMeters: Number(route.distance) || 0,
          durationMinutes: Number.isFinite(durationSeconds)
            ? Math.max(1, Math.round(durationSeconds / 60))
            : 0,
          trafficLightCount: Number.isFinite(trafficLightCount)
            ? trafficLightCount
            : null,
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
      throw new AmapWebError(
        `闭合路线计算失败：${describeAmapServiceError(error)}`,
        "SERVICE_FAILED",
        error,
      );
    }
  }

  private async resolveCurrentLocation(): Promise<WebMapLocation> {
    if (this.currentLocation && !this.currentLocation.approximate) {
      return this.currentLocation;
    }
    if (this.currentLocationRequest) return this.currentLocationRequest;
    const approximateFallback = this.currentLocation?.approximate
      ? this.currentLocation
      : null;
    const request = (async () => {
      try {
        const coordinate = await this.getPreciseLocation();
        return { coordinate, approximate: false };
      } catch (error) {
        if (approximateFallback) return approximateFallback;
        const coordinate = await this.getIpLocation();
        if (coordinate) return { coordinate, approximate: true };
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
    if (!navigator.permissions) return false;
    try {
      const permission = await navigator.permissions.query({ name: "geolocation" });
      return permission.state === "granted";
    } catch {
      return false;
    }
  }

  private getPreciseLocation() {
    if (this.preciseLocation) return Promise.resolve(this.preciseLocation);
    if (this.preciseLocationRequest) return this.preciseLocationRequest;
    if (!navigator.geolocation) {
      return Promise.reject(new AmapWebError("当前浏览器不支持定位", "SERVICE_FAILED"));
    }
    const request = new Promise<MapCoordinate>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new AmapWebError("获取当前位置超时", "SERVICE_FAILED"));
      }, 8000);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          const coordinate = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          if (!isValidCoordinate(coordinate)) {
            reject(new AmapWebError("浏览器返回了无效位置", "INVALID_RESULT"));
            return;
          }
          if (
            !Number.isFinite(position.coords.accuracy)
            || position.coords.accuracy > MAX_PRECISE_LOCATION_ACCURACY_METERS
          ) {
            reject(new AmapWebError(
              "浏览器定位精度过低，继续使用 IP 定位",
              "INVALID_RESULT",
            ));
            return;
          }
          resolve(coordinate);
        },
        (error) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          reject(new AmapWebError(
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
        const params = new URLSearchParams({
          location: `${coordinate.latitude},${coordinate.longitude}`,
        });
        try {
          const response = await requestAmapProxy<AmapServiceResponse & {
            locations?: string;
          }>(`/api/amap/coordinate-translate?${params.toString()}`);
          const translated = parseCoordinate(response.locations) ?? coordinate;
          this.preciseLocation = translated;
          this.searchLocation = translated;
          return translated;
        } catch (error) {
          locationDebug("warn", "coordinate-translate:fallback-source", {
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
    const response = await requestAmapProxy<AmapServiceResponse & {
      rectangle?: unknown;
    }>("/api/amap/ip-location");
    if (typeof response.rectangle !== "string") return null;
    const [southwestText, northeastText] = response.rectangle.split(";");
    const southwest = parseCoordinate(southwestText);
    const northeast = parseCoordinate(northeastText);
    if (!southwest || !northeast) return null;
    const coordinate = {
      latitude: (southwest.latitude + northeast.latitude) / 2,
      longitude: (southwest.longitude + northeast.longitude) / 2,
    };
    return isValidCoordinate(coordinate) ? coordinate : null;
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
