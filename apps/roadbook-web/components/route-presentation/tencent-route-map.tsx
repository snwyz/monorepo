"use client";

import type {
  ClosedDrivingRoute,
  TencentMapWebAdapter,
  WebMapCanvas,
} from "@roadbook/map/web";
import { useEffect, useRef, useState } from "react";

import type { ControlPoint } from "@/domain/route-planning/model";
import {
  LocateIcon,
  MinusIcon,
  PlusIcon,
} from "@/components/route-presentation/tool-icons";

interface TencentRouteMapProps {
  adapter: TencentMapWebAdapter | null;
  controlPoints: ControlPoint[];
  route: ClosedDrivingRoute | null;
  selectedControlPointId: string | null;
  selectedRouteLegId: string | null;
  routeUpdating: boolean;
  onDoubleClick: (coordinate: { latitude: number; longitude: number }) => void;
  onSelectControlPoint: (id: string) => void;
  onSelectRouteLeg: (id: string) => void;
}

export function TencentRouteMap({
  adapter,
  controlPoints,
  route,
  selectedControlPointId,
  selectedRouteLegId,
  routeUpdating,
  onDoubleClick,
  onSelectControlPoint,
  onSelectRouteLeg,
}: TencentRouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<WebMapCanvas | null>(null);
  const controlPointsRef = useRef(controlPoints);
  const routeRef = useRef(route);
  const routeUpdatingRef = useRef(routeUpdating);
  const selectedControlPointIdRef = useRef(selectedControlPointId);
  const selectedRouteLegIdRef = useRef(selectedRouteLegId);
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
      nextCanvas.setRouteLegs(
        (routeRef.current?.legs ?? []).map((leg) => ({
          id: leg.id,
          path: leg.path,
          selected: leg.id === selectedRouteLegIdRef.current,
          stale: routeUpdatingRef.current,
        })),
      );
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
  }, [adapter, onDoubleClick, onSelectControlPoint, onSelectRouteLeg]);

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
    canvasRef.current?.setRouteLegs(
      (route?.legs ?? []).map((leg) => ({
        id: leg.id,
        path: leg.path,
        selected: leg.id === selectedRouteLegId,
        stale: routeUpdating,
      })),
    );
  }, [route, routeUpdating, selectedRouteLegId]);

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
    <div className="route-map" aria-label="腾讯地图路线工作区">
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
      <div className="map-attribution">腾讯地图</div>
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
