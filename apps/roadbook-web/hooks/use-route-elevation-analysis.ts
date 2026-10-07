"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DrivingRoute, WebMapProvider } from "@roadbook/map/web";
import type { ControlPoint } from "@/domain/route-planning/model";
import { buildElevationGeometry } from "@/domain/elevation-analysis/geometry";
import { sectionsInRange, summarizeElevation } from "@/domain/elevation-analysis/analyze";
import type { ElevationProfile, ElevationProvider, RouteElevationRange } from "@/domain/elevation-analysis/model";
import { HttpElevationProvider } from "@/infrastructure/elevation-analysis/http-elevation-provider";
import { getCachedElevationProfile, loadElevationProfile } from "@/infrastructure/elevation-analysis/profile-cache";

const provider = new HttpElevationProvider();
interface AnalysisState {
  key: string;
  status: "loading" | "ready" | "failed";
  profile: ElevationProfile | null;
  completed: number;
  total: number;
  message: string | null;
}
export interface RouteElevationContext {
  route: DrivingRoute | null;
  points: ControlPoint[];
  planId: string | null;
  revision: number;
  mapProvider: WebMapProvider;
}
export function useRouteElevationAnalysis(context: RouteElevationContext, enabled: boolean, selectedLegId: string | null, elevationProvider: ElevationProvider = provider) {
  const { route, points, planId, revision, mapProvider } = context;
  const geometryResult = useMemo(() => {
    if (!route) return { geometry: null, error: null };
    try { return { geometry: buildElevationGeometry(route, new Map(points.map((point) => [point.id, point.name]))), error: null }; }
    catch (error) { return { geometry: null, error: error instanceof Error ? error.message : "道路几何不足" }; }
  }, [route, points]);
  const geometry = geometryResult.geometry;
  const key = geometry ? `${planId}:${revision}:${mapProvider}:${geometry.signature}` : "";
  const [state, setState] = useState<AnalysisState | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const handledRetry = useRef(0);
  const [selection, setSelection] = useState<{ key: string; range: RouteElevationRange } | null>(null);
  const [slopeChoice, setSlopeChoice] = useState<{ key: string; id: string } | null>(null);
  const [localView, setLocalView] = useState<{ key: string; range: RouteElevationRange } | null>(null);
  const cachedProfile = useMemo(() => geometry ? getCachedElevationProfile(geometry, elevationProvider) : null, [geometry, elevationProvider]);
  const profile = state?.key === key && state.status === "ready" ? state.profile : cachedProfile;

  useEffect(() => {
    if (!enabled || !geometry || !key) return;
    const controller = new AbortController();
    let disposed = false;
    const force = retryVersion !== handledRetry.current;
    queueMicrotask(() => {
      if (disposed) return;
      if (force || !getCachedElevationProfile(geometry, elevationProvider)) {
        setState({ key, status: "loading", profile: null, completed: 0, total: 0, message: null });
      }
      handledRetry.current = retryVersion;
      void loadElevationProfile(geometry, elevationProvider, controller.signal, (completed, total) => {
        if (!disposed) setState({ key, status: "loading", profile: null, completed, total, message: null });
      }, force).then(({ profile: next, warning }) => {
        if (!disposed) setState({ key, status: "ready", profile: next, completed: 0, total: 0, message: warning });
      }).catch((error) => {
        if (!disposed) setState({ key, status: "failed", profile: null, completed: 0, total: 0, message: error instanceof Error ? error.message : "高程查询失败" });
      });
    });
    return () => { disposed = true; controller.abort(); };
  }, [enabled, geometry, key, retryVersion, elevationProvider]);

  const fullRange = useMemo(() => ({ startMeters: 0, endMeters: geometry?.distanceMeters ?? 0 }), [geometry?.distanceMeters]);
  const legRange = useMemo(() => {
    if (!selectedLegId || !geometry) return null;
    const legVertices = geometry.vertices.filter((vertex) => vertex.legId === selectedLegId);
    return legVertices.length ? { startMeters: legVertices[0].distanceMeters, endMeters: legVertices[legVertices.length - 1].distanceMeters } : null;
  }, [geometry, selectedLegId]);
  // 原工作台路段选择有自己的来源；用户在卡片改范围后可覆盖，下一次选路段再同步。
  const [rangeLegSource, setRangeLegSource] = useState<string | null>(null);
  const range = selection?.key === key && rangeLegSource === selectedLegId ? selection.range : legRange ?? fullRange;
  const viewRange = localView?.key === key && rangeLegSource === selectedLegId ? localView.range : range;
  const summary = useMemo(() => profile ? summarizeElevation(profile.samples, viewRange) : null, [profile, viewRange]);
  const sections = useMemo(() => profile ? sectionsInRange(profile, viewRange) : [], [profile, viewRange]);
  const selectedSection = slopeChoice?.key === key ? sections.find((section) => section.id === slopeChoice.id) ?? null : null;
  const setRange = useCallback((next: RouteElevationRange) => {
    if (!geometry || !Number.isFinite(next.startMeters) || !Number.isFinite(next.endMeters) || next.startMeters < 0 || next.endMeters > geometry.distanceMeters || next.startMeters >= next.endMeters) return false;
    setSelection({ key, range: next }); setRangeLegSource(selectedLegId); setLocalView(null); setSlopeChoice(null);
    return true;
  }, [geometry, key, selectedLegId]);
  return {
    geometry, profile, summary, sections, selectedSection, range, viewRange,
    isLocalView: Boolean(localView?.key === key && rangeLegSource === selectedLegId),
    state: state?.key === key ? state : null,
    error: geometryResult.error,
    key,
    setRange,
    selectSection: (id: string | null) => { setSlopeChoice(id ? { key, id } : null); setLocalView(null); setRangeLegSource(selectedLegId); },
    viewSection: () => { if (selectedSection) { setLocalView({ key, range: selectedSection }); setRangeLegSource(selectedLegId); } },
    returnToRange: () => setLocalView(null),
    retry: () => setRetryVersion((value) => value + 1),
  };
}
