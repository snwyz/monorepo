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
  WebMapRouteLegInsertion,
  WebMapViewportPadding,
} from "./web-types";
import { AmapWebError } from "./web-types";
import { createControlPointLabelVisual } from "./control-point-label";
import {
  areCoordinatesInsideViewport,
  getCoordinateBounds,
  isValidMapCoordinate,
} from "./web-viewport";

type AmapPosition = [number, number];

interface AmapLngLat {
  getLat(): number;
  getLng(): number;
}

interface AmapMapEvent {
  lnglat?: AmapLngLat;
}

interface AmapEventTarget {
  on(event: string, handler: (event: AmapMapEvent) => void): void;
  off(event: string, handler: (event: AmapMapEvent) => void): void;
}

interface AmapOverlay extends AmapEventTarget {
  setMap(map: AmapMapInstance | null): void;
  setPath?(path: AmapPosition[]): void;
}

interface AmapMapInstance extends AmapEventTarget {
  add(overlays: AmapOverlay | AmapOverlay[]): void;
  setCenter(center: AmapPosition): void;
  setZoom(zoom: number): void;
  getZoom(): number;
  getCenter(): AmapLngLat;
  setBounds(bounds: unknown, immediately?: boolean, avoid?: number[]): void;
  setStatus(status: Record<string, boolean>): void;
  destroy(): void;
}

interface AmapNamespace {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AmapMapInstance;
  Marker: new (options: Record<string, unknown>) => AmapOverlay;
  Polyline: new (options: Record<string, unknown>) => AmapOverlay;
  Bounds: new (southwest: AmapPosition, northeast: AmapPosition) => unknown;
  Pixel: new (x: number, y: number) => unknown;
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
  return isValidMapCoordinate(coordinate) ? coordinate : null;
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

function locationMarkerSvg() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="%231677ff" fill-opacity=".3"/><circle cx="16" cy="16" r="10" fill="%231677ff" stroke="%23ffffff" stroke-width="2"/></svg>';
  return `data:image/svg+xml,${svg}`;
}

function routeLegInsertionHandleSvg() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="%23ffffff" stroke="%230a0a0a" stroke-width="2"/><path d="M16 8v16M8 16h16M16 8l-3 3m3-3 3 3M24 16l-3-3m3 3-3 3M16 24l-3-3m3 3 3-3M8 16l3-3m-3 3 3 3" fill="none" stroke="%230a0a0a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return `data:image/svg+xml,${svg}`;
}

function markerContent(source: string, width: number, height = width) {
  const container = document.createElement("div");
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.pointerEvents = "none";

  const image = document.createElement("img");
  image.src = source;
  image.alt = "";
  image.width = width;
  image.height = height;
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
  private routeLegInsertionOutline: AmapOverlay | null = null;
  private routeLegInsertionGuide: AmapOverlay | null = null;
  private routeLegInsertionHandle: AmapOverlay | null = null;
  private routeLegInsertionHandlers: Array<{
    event: string;
    handler: (event: AmapMapEvent) => void;
  }> = [];
  private userLocationOverlay: AmapOverlay | null = null;
  private readonly onDoubleClick?: (coordinate: MapCoordinate) => void;
  private readonly onMapBackgroundSelect?: () => void;
  private readonly onMarkerSelect?: (controlPointId: string) => void;
  private readonly onRouteLegSelect?: (routeLegId: string) => void;
  private readonly onRouteLegInsert?: (
    routeLegId: string,
    coordinate: MapCoordinate,
  ) => void;
  private readonly onReady?: () => void;
  private dragResetFrame: number | null = null;

  private readonly mapReadyHandler = () => {
    locationDebug("info", "map:complete", { zoom: this.map.getZoom() });
    this.onReady?.();
  };

  private readonly doubleClickHandler = (event: AmapMapEvent) => {
    this.releaseDragState();
    if (event.lnglat) this.onDoubleClick?.(toCoordinate(event.lnglat));
  };

  private readonly mapClickHandler = () => {
    this.onMapBackgroundSelect?.();
  };

  private releaseDragState() {
    if (this.dragResetFrame !== null) cancelAnimationFrame(this.dragResetFrame);
    this.map.setStatus({ dragEnable: false, doubleClickZoom: false });
    this.dragResetFrame = requestAnimationFrame(() => {
      this.dragResetFrame = null;
      this.map.setStatus({ dragEnable: true, doubleClickZoom: false });
    });
  }

  constructor(
    private readonly amap: AmapNamespace,
    private readonly map: AmapMapInstance,
    private readonly container: HTMLElement,
    private readonly resolveCurrentLocation: () => Promise<WebMapLocation>,
    options: WebMapOptions,
  ) {
    this.onDoubleClick = options.onDoubleClick;
    this.onMapBackgroundSelect = options.onMapBackgroundSelect;
    this.onMarkerSelect = options.onMarkerSelect;
    this.onRouteLegSelect = options.onRouteLegSelect;
    this.onRouteLegInsert = options.onRouteLegInsert;
    this.onReady = options.onReady;
    options.onLoading?.();
    map.setStatus({ doubleClickZoom: false });
    map.on("dblclick", this.doubleClickHandler);
    map.on("click", this.mapClickHandler);
    map.on("complete", this.mapReadyHandler);
  }

  setControlPoints(controlPoints: WebMapControlPoint[]) {
    this.clearInteractiveOverlays(this.controlPointOverlays);
    this.controlPointOverlays = controlPoints.map((point) => {
      const visual = createControlPointLabelVisual(point);
      const marker = new this.amap.Marker({
        position: toPosition(point),
        content: markerContent(visual.source, visual.width, visual.height),
        anchor: "top-left",
        offset: new this.amap.Pixel(-visual.anchor.x, -visual.anchor.y),
        zIndex: point.selected ? 130 : 120,
        bubble: false,
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
        bubble: false,
      });
      const handler = () => this.onRouteLegSelect?.(leg.id);
      route.on("click", handler);
      this.map.add(route);
      return { overlay: route, handler };
    });
  }

  setRouteLegInsertion(insertion: WebMapRouteLegInsertion | null) {
    this.clearRouteLegInsertion();
    if (!insertion || !isValidMapCoordinate(insertion.coordinate)) return;

    const path = [insertion.from, insertion.coordinate, insertion.to].map(toPosition);
    this.routeLegInsertionOutline = new this.amap.Polyline({
      path,
      strokeColor: "#ffffff",
      strokeWeight: 7,
      strokeOpacity: 1,
      lineJoin: "round",
      lineCap: "round",
      zIndex: 80,
      bubble: true,
    });
    this.routeLegInsertionGuide = new this.amap.Polyline({
      path,
      strokeColor: "#8a8a8a",
      strokeWeight: 3,
      strokeStyle: "dashed",
      strokeDasharray: [6, 6],
      strokeOpacity: 1,
      lineJoin: "round",
      lineCap: "round",
      zIndex: 90,
      bubble: true,
    });
    const handle = new this.amap.Marker({
      position: toPosition(insertion.coordinate),
      content: markerContent(routeLegInsertionHandleSvg(), 32),
      anchor: "center",
      cursor: "grab",
      draggable: true,
      zIndex: 140,
      bubble: false,
    });
    const updateGuide = (event: AmapMapEvent) => {
      if (!event.lnglat) return;
      const coordinate = toCoordinate(event.lnglat);
      const nextPath = [insertion.from, coordinate, insertion.to].map(toPosition);
      this.routeLegInsertionOutline?.setPath?.(nextPath);
      this.routeLegInsertionGuide?.setPath?.(nextPath);
    };
    const commitInsertion = (event: AmapMapEvent) => {
      if (!event.lnglat) return;
      const coordinate = toCoordinate(event.lnglat);
      updateGuide(event);
      this.onRouteLegInsert?.(insertion.routeLegId, coordinate);
    };
    handle.on("dragging", updateGuide);
    handle.on("dragend", commitInsertion);
    this.routeLegInsertionHandlers = [
      { event: "dragging", handler: updateGuide },
      { event: "dragend", handler: commitInsertion },
    ];
    this.map.add([
      this.routeLegInsertionOutline,
      this.routeLegInsertionGuide,
      handle,
    ]);
    this.routeLegInsertionHandle = handle;
  }

  setUserLocation(location: WebMapLocation | null) {
    this.userLocationOverlay?.setMap(null);
    this.userLocationOverlay = null;
    if (!location || !isValidMapCoordinate(location.coordinate)) return;
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
    if (isValidMapCoordinate(center)) this.map.setCenter(toPosition(center));
  }

  setView(center: MapCoordinate, zoom: number) {
    if (!isValidMapCoordinate(center)) return;
    this.map.setCenter(toPosition(center));
    this.map.setZoom(zoom);
  }

  containsCoordinates(
    coordinates: MapCoordinate[],
    padding: WebMapViewportPadding,
  ) {
    const center = this.map.getCenter();
    return areCoordinatesInsideViewport(coordinates, {
      center: toCoordinate(center),
      zoom: this.map.getZoom(),
      width: this.container.clientWidth,
      height: this.container.clientHeight,
    }, padding);
  }

  fitCoordinates(
    coordinates: MapCoordinate[],
    options: Parameters<WebMapCanvas["fitCoordinates"]>[1] = {},
  ) {
    const bounds = getCoordinateBounds(coordinates);
    if (!bounds) return;
    if (bounds.validCoordinateCount === 1) {
      this.setView(bounds.southwest, 13);
      return;
    }
    const padding = options.padding ?? { top: 48, right: 48, bottom: 48, left: 48 };
    this.map.setBounds(new this.amap.Bounds(
      toPosition(bounds.southwest),
      toPosition(bounds.northeast),
    ), options.animated === false, [
      padding.top,
      padding.bottom,
      padding.left,
      padding.right,
    ]);
  }

  zoomBy(delta: number) {
    this.map.setZoom(this.map.getZoom() + delta);
  }

  async locate() {
    const result = await this.resolveCurrentLocation();
    if (!isValidMapCoordinate(result.coordinate)) {
      throw new AmapWebError("定位结果无效", "INVALID_RESULT");
    }
    this.setUserLocation(result);
    this.setView(result.coordinate, result.approximate ? 11 : 14);
    return result;
  }

  destroy() {
    if (this.dragResetFrame !== null) cancelAnimationFrame(this.dragResetFrame);
    this.dragResetFrame = null;
    this.map.off("dblclick", this.doubleClickHandler);
    this.map.off("click", this.mapClickHandler);
    this.map.off("complete", this.mapReadyHandler);
    this.clearInteractiveOverlays(this.controlPointOverlays);
    this.clearOverlays(this.routeOutlineOverlays);
    this.clearInteractiveOverlays(this.routeOverlays);
    this.clearRouteLegInsertion();
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

  private clearRouteLegInsertion() {
    for (const { event, handler } of this.routeLegInsertionHandlers) {
      this.routeLegInsertionHandle?.off(event, handler);
    }
    this.routeLegInsertionHandlers = [];
    this.routeLegInsertionHandle?.setMap(null);
    this.routeLegInsertionGuide?.setMap(null);
    this.routeLegInsertionOutline?.setMap(null);
    this.routeLegInsertionHandle = null;
    this.routeLegInsertionGuide = null;
    this.routeLegInsertionOutline = null;
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
      container,
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

  async resolveCurrentLocation(): Promise<WebMapLocation> {
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
          if (!isValidMapCoordinate(coordinate)) {
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
    return isValidMapCoordinate(coordinate) ? coordinate : null;
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
