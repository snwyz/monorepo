"use client";

import type {
  MapCoordinate,
  PlaceCandidate,
  WebMapAdapter,
} from "@roadbook/map/web";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  FEATURED_ROUTE_MARKER_LIMIT,
  type FeaturedDrivingRoute,
  type FeaturedRouteUserMarker,
} from "@/domain/featured-driving-route/model";
import { LocalFeaturedRouteMarkerRepository } from "@/infrastructure/featured-driving-route/local-featured-route-marker-repository";

function createMarkerId() {
  const value = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `featured-marker-${value}`;
}

export function useFeaturedDrivingRouteAtlas(adapter: WebMapAdapter | null) {
  const repository = useMemo(
    () => new LocalFeaturedRouteMarkerRepository(),
    [],
  );
  const [activeRoute, setActiveRoute] = useState<FeaturedDrivingRoute | null>(null);
  const [markers, setMarkers] = useState<FeaturedRouteUserMarker[]>([]);
  const [selectedControlPointId, setSelectedControlPointId] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{
    coordinate: MapCoordinate;
    zoom: number;
    sequence: number;
  } | null>(null);
  const activeRouteRef = useRef<FeaturedDrivingRoute | null>(null);
  const markersRef = useRef<FeaturedRouteUserMarker[]>([]);
  const focusSequenceRef = useRef(0);

  const updateMarkers = useCallback((next: FeaturedRouteUserMarker[]) => {
    const routeId = activeRouteRef.current?.id;
    if (!routeId) return;
    markersRef.current = next;
    setMarkers(next);
    repository.save(routeId, next);
  }, [repository]);

  const openRoute = useCallback((route: FeaturedDrivingRoute) => {
    activeRouteRef.current = route;
    const storedMarkers = repository.list(route.id).slice(0, FEATURED_ROUTE_MARKER_LIMIT);
    markersRef.current = storedMarkers;
    setMarkers(storedMarkers);
    setSelectedControlPointId(null);
    setSelectedMarkerId(null);
    setFocusRequest(null);
    setActiveRoute(route);
  }, [repository]);

  const closeRoute = useCallback(() => {
    activeRouteRef.current = null;
    markersRef.current = [];
    setActiveRoute(null);
    setMarkers([]);
    setSelectedControlPointId(null);
    setSelectedMarkerId(null);
    setFocusRequest(null);
  }, []);

  const requestFocus = useCallback((coordinate: MapCoordinate, zoom: number) => {
    focusSequenceRef.current += 1;
    setFocusRequest({ coordinate, zoom, sequence: focusSequenceRef.current });
  }, []);

  const selectControlPoint = useCallback((id: string) => {
    const controlPoint = activeRouteRef.current?.controlPoints.find((item) => item.id === id);
    if (!controlPoint) return;
    setSelectedControlPointId(id);
    setSelectedMarkerId(null);
    requestFocus(controlPoint, 9);
  }, [requestFocus]);

  const selectMarker = useCallback((id: string) => {
    const marker = markersRef.current.find((item) => item.id === id);
    if (!marker) return;
    setSelectedMarkerId(id);
    setSelectedControlPointId(null);
    requestFocus(marker, 13);
  }, [requestFocus]);

  const clearSelection = useCallback(() => {
    setSelectedControlPointId(null);
    setSelectedMarkerId(null);
  }, []);

  const addResolvedMarker = useCallback((candidate: {
    name: string;
    address: string;
    coordinate: MapCoordinate;
  }) => {
    const route = activeRouteRef.current;
    if (!route || markersRef.current.length >= FEATURED_ROUTE_MARKER_LIMIT) return null;
    const marker: FeaturedRouteUserMarker = {
      id: createMarkerId(),
      routeId: route.id,
      name: candidate.name,
      address: candidate.address,
      ...candidate.coordinate,
      createdAt: new Date().toISOString(),
    };
    updateMarkers([...markersRef.current, marker]);
    setSelectedMarkerId(marker.id);
    setSelectedControlPointId(null);
    requestFocus(marker, 13);
    return marker.id;
  }, [requestFocus, updateMarkers]);

  const addPlaceMarker = useCallback((candidate: PlaceCandidate) => {
    return addResolvedMarker(candidate);
  }, [addResolvedMarker]);

  const addCoordinateMarker = useCallback(async (coordinate: MapCoordinate) => {
    const markerId = addResolvedMarker({
      name: "地图标记",
      address: "地址解析中…",
      coordinate,
    });
    if (!markerId) return;
    const resolved = adapter
      ? await adapter.reverseGeocode(coordinate)
      : { name: "地图标记", address: "未识别地址" };
    const next = markersRef.current.map((marker) => marker.id === markerId
      ? { ...marker, ...resolved }
      : marker);
    updateMarkers(next);
  }, [adapter, addResolvedMarker, updateMarkers]);

  const removeMarker = useCallback((id: string) => {
    updateMarkers(markersRef.current.filter((marker) => marker.id !== id));
    setSelectedMarkerId((current) => current === id ? null : current);
  }, [updateMarkers]);

  const clearMarkers = useCallback(() => {
    const routeId = activeRouteRef.current?.id;
    if (!routeId) return;
    repository.clear(routeId);
    markersRef.current = [];
    setMarkers([]);
    setSelectedMarkerId(null);
  }, [repository]);

  return {
    activeRoute,
    markers,
    selectedControlPointId,
    selectedMarkerId,
    focusRequest,
    markerLimitReached: markers.length >= FEATURED_ROUTE_MARKER_LIMIT,
    openRoute,
    closeRoute,
    selectControlPoint,
    selectMarker,
    clearSelection,
    addPlaceMarker,
    addCoordinateMarker,
    removeMarker,
    clearMarkers,
  };
}
