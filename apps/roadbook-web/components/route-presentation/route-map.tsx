"use client";

import type {
  ClosedDrivingRoute,
  MapCoordinate,
  WebMapAdapter,
  WebMapCanvas,
  WebMapFitOptions,
  WebMapProvider,
} from "@roadbook/map/web";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ControlPoint } from "@/domain/route-planning/model";
import {
  LocateIcon,
  MinusIcon,
  PlusIcon,
} from "@/components/route-presentation/tool-icons";

interface RouteMapProps {
  adapter: WebMapAdapter | null;
  provider: WebMapProvider;
  controlPoints: ControlPoint[];
  route: ClosedDrivingRoute | null;
  selectedControlPointId: string | null;
  selectedRouteLegId: string | null;
  routeUpdating: boolean;
  focusControlPointRequest: { id: string; sequence: number } | null;
  fitRoutePlanRequest: { planId: string; sequence: number } | null;
  onDoubleClick: (coordinate: { latitude: number; longitude: number }) => void;
  onSelectControlPoint: (id: string) => void;
  onSelectRouteLeg: (id: string) => void;
}

const MOBILE_DISTANCE_FALLBACK_METERS = 2_000;
const EARTH_RADIUS_METERS = 6_371_000;

function getMapFitOptions(): WebMapFitOptions {
  const isMobile = window.matchMedia("(max-width: 760px)").matches;
  return {
    animated: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    padding: isMobile
      ? { top: 148, right: 24, bottom: 96, left: 62 }
      : { top: 96, right: 356, bottom: 96, left: 24 },
  };
}

function getCoordinateDistanceMeters(from: MapCoordinate, to: MapCoordinate) {
  const latitudeDelta = (to.latitude - from.latitude) * Math.PI / 180;
  const longitudeDelta = (to.longitude - from.longitude) * Math.PI / 180;
  const fromLatitude = from.latitude * Math.PI / 180;
  const toLatitude = to.latitude * Math.PI / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude)
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function getRouteCoordinates(route: ClosedDrivingRoute) {
  return route.legs.flatMap((leg) => leg.path);
}

export function RouteMap({
  adapter,
  provider,
  controlPoints,
  route,
  selectedControlPointId,
  selectedRouteLegId,
  routeUpdating,
  focusControlPointRequest,
  fitRoutePlanRequest,
  onDoubleClick,
  onSelectControlPoint,
  onSelectRouteLeg,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<WebMapCanvas | null>(null);
  const controlPointsRef = useRef(controlPoints);
  const routeRef = useRef(route);
  const routeUpdatingRef = useRef(routeUpdating);
  const selectedControlPointIdRef = useRef(selectedControlPointId);
  const selectedRouteLegIdRef = useRef(selectedRouteLegId);
  const fitRoutePlanRequestRef = useRef(fitRoutePlanRequest);
  const appliedFitRoutePlanSequenceRef = useRef<number | null>(null);
  const previousControlPointIdsRef = useRef<string[]>([]);
  const checkedRouteViewportRef = useRef<ClosedDrivingRoute | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [mapVisualReady, setMapVisualReady] = useState(false);
  useEffect(() => {
    controlPointsRef.current = controlPoints;
  }, [controlPoints]);

  useEffect(() => {
    routeRef.current = route;
    routeUpdatingRef.current = routeUpdating;
    selectedControlPointIdRef.current = selectedControlPointId;
    selectedRouteLegIdRef.current = selectedRouteLegId;
  }, [route, routeUpdating, selectedControlPointId, selectedRouteLegId]);

  const fitPendingRoutePlan = useCallback((canvas: WebMapCanvas | null) => {
    const request = fitRoutePlanRequestRef.current;
    if (
      !canvas
      || !request
      || appliedFitRoutePlanSequenceRef.current === request.sequence
      || controlPointsRef.current.length === 0
    ) return;
    canvas.fitCoordinates(controlPointsRef.current, getMapFitOptions());
    appliedFitRoutePlanSequenceRef.current = request.sequence;
  }, []);

  const fitRouteGeometryIfNeeded = useCallback((
    canvas: WebMapCanvas | null,
    nextRoute: ClosedDrivingRoute | null,
  ) => {
    if (!canvas || !nextRoute) return;
    const coordinates = getRouteCoordinates(nextRoute);
    if (coordinates.length === 0) return;
    const options = getMapFitOptions();
    if (!canvas.containsCoordinates(coordinates, options.padding!)) {
      canvas.fitCoordinates(coordinates, options);
    }
  }, []);

  useEffect(() => {
    fitRoutePlanRequestRef.current = fitRoutePlanRequest;
    fitPendingRoutePlan(canvasRef.current);
  }, [fitRoutePlanRequest, fitPendingRoutePlan]);

  useEffect(() => {
    if (!adapter || !containerRef.current) return;
    let disposed = false;
    let canvas: WebMapCanvas | null = null;
    const container = containerRef.current;
    void adapter.resolveInitialLocation().then((coordinate) => {
      if (disposed) return;
      const nextCanvas = adapter.createMap(container, {
        center: coordinate ?? undefined,
        zoom: 11,
        onDoubleClick,
        onMarkerSelect: onSelectControlPoint,
        onRouteLegSelect: onSelectRouteLeg,
        onLoading: () => setMapVisualReady(false),
        onReady: () => setMapVisualReady(true),
      });
      canvas = nextCanvas;
      canvasRef.current = nextCanvas;
      appliedFitRoutePlanSequenceRef.current = null;
      if (coordinate) {
        nextCanvas.setUserLocation({
          coordinate,
          approximate: true,
        });
      }
      nextCanvas.setControlPoints(
        controlPointsRef.current.map((point, index) => ({
          ...point,
          order: index + 1,
          selected: point.id === selectedControlPointIdRef.current,
        })),
      );
      fitPendingRoutePlan(nextCanvas);
      nextCanvas.setRouteLegs(
        (routeRef.current?.legs ?? []).map((leg) => ({
          id: leg.id,
          path: leg.path,
          selected: leg.id === selectedRouteLegIdRef.current,
          stale: routeUpdatingRef.current,
        })),
      );
      fitRouteGeometryIfNeeded(nextCanvas, routeRef.current);
      checkedRouteViewportRef.current = routeRef.current;
      void adapter.resolveAuthorizedLocation().then((preciseCoordinate) => {
        if (
          preciseCoordinate &&
          !disposed &&
          canvasRef.current === nextCanvas &&
          controlPointsRef.current.length === 0
        ) {
          nextCanvas.setUserLocation({
            coordinate: preciseCoordinate,
            approximate: false,
          });
          nextCanvas.setView(preciseCoordinate, 14);
        }
      });
    });
    return () => {
      disposed = true;
      canvasRef.current = null;
      canvas?.destroy();
    };
  }, [
    adapter,
    fitPendingRoutePlan,
    fitRouteGeometryIfNeeded,
    onDoubleClick,
    onSelectControlPoint,
    onSelectRouteLeg,
  ]);

  useEffect(() => {
    canvasRef.current?.setControlPoints(
      controlPoints.map((point, index) => ({
        ...point,
        order: index + 1,
        selected: point.id === selectedControlPointId,
      })),
    );
  }, [controlPoints, selectedControlPointId]);

  useEffect(() => {
    if (!focusControlPointRequest) return;
    const point = controlPointsRef.current.find(
      (controlPoint) => controlPoint.id === focusControlPointRequest.id,
    );
    if (!point) return;
    canvasRef.current?.setCenter(point);
  }, [focusControlPointRequest]);

  useEffect(() => {
    const previousIds = previousControlPointIdsRef.current;
    const currentIds = controlPoints.map((point) => point.id);
    previousControlPointIdsRef.current = currentIds;
    if (controlPoints.length < 2 || currentIds.length <= previousIds.length) return;
    if (
      fitRoutePlanRequest
      && appliedFitRoutePlanSequenceRef.current === fitRoutePlanRequest.sequence
    ) return;

    const addedPoint = controlPoints.find((point) => !previousIds.includes(point.id));
    if (!addedPoint) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const options = getMapFitOptions();
    const exceedsMobileDistanceFallback = window.matchMedia("(max-width: 760px)").matches
      && controlPoints.some((point) => (
        point.id !== addedPoint.id
        && getCoordinateDistanceMeters(point, addedPoint) > MOBILE_DISTANCE_FALLBACK_METERS
      ));
    if (
      exceedsMobileDistanceFallback
      || !canvas.containsCoordinates(controlPoints, options.padding!)
    ) {
      canvas.fitCoordinates(controlPoints, options);
    }
  }, [controlPoints, fitRoutePlanRequest]);

  useEffect(() => {
    canvasRef.current?.setRouteLegs(
      (route?.legs ?? []).map((leg) => ({
        id: leg.id,
        path: leg.path,
        selected: leg.id === selectedRouteLegId,
        stale: routeUpdating,
      })),
    );
    if (!route) {
      checkedRouteViewportRef.current = null;
      return;
    }
    if (routeUpdating || checkedRouteViewportRef.current === route) return;
    fitRouteGeometryIfNeeded(canvasRef.current, route);
    checkedRouteViewportRef.current = route;
  }, [fitRouteGeometryIfNeeded, route, routeUpdating, selectedRouteLegId]);

  const locate = async () => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setLocationMessage("正在定位…");
      const result = await canvas.locate();
      setLocationMessage(
        result.approximate
          ? "精确定位失败，已定位到当前城市"
          : "已定位到当前位置",
      );
    } catch (error) {
      setLocationMessage(error instanceof Error ? error.message : "定位失败");
    }
    window.setTimeout(() => setLocationMessage(null), 2400);
  };

  return (
    <div
      className="route-map"
      aria-label={`${provider === "amap" ? "高德" : "腾讯"}地图路线工作区`}
    >
      <div className="route-map__fallback" aria-hidden="true">
        <span className="route-map__road route-map__road--one" />
        <span className="route-map__road route-map__road--two" />
        <span className="route-map__river" />
        <span className="route-map__loading">正在定位并加载地图…</span>
      </div>
      <div
        ref={containerRef}
        className={`route-map__canvas${mapVisualReady ? " is-ready" : ""}`}
      />
      {mapVisualReady ? (
        <div className="map-center-location" aria-hidden="true">
          <span className="loc_icon center_icon" />
        </div>
      ) : null}
      <div className="map-attribution">{provider === "amap" ? "高德地图" : "腾讯地图"}</div>
      <div className="map-controls" aria-label="地图工具">
        <button
          type="button"
          onClick={() => canvasRef.current?.zoomBy(1)}
          aria-label="放大地图"
          title="放大"
        >
          <PlusIcon />
        </button>
        <button
          type="button"
          onClick={() => canvasRef.current?.zoomBy(-1)}
          aria-label="缩小地图"
          title="缩小"
        >
          <MinusIcon />
        </button>
        <span className="map-controls__divider" />
        <button
          type="button"
          onClick={locate}
          aria-label="定位到当前位置"
          title="定位"
        >
          <LocateIcon />
        </button>
      </div>
      {locationMessage ? (
        <div className="map-toast" role="status">
          {locationMessage}
        </div>
      ) : null}
    </div>
  );
}
