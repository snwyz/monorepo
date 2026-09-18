"use client";

import {
  TencentMapWebAdapter,
  type ClosedDrivingRoute,
  type DrivingStrategy,
  type MapCoordinate,
  type PlaceCandidate,
} from "@roadbook/map/web";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createRoutePlan,
  reviseRoutePlan,
  type ControlPoint,
  type DraftStatus,
  type RouteCalculationStatus,
  type RoutePlan,
  type RoutePlanSummary,
} from "@/domain/route-planning/model";
import { LocalRoutePlanRepository } from "@/infrastructure/route-plan/local-route-plan-repository";

function createId(prefix: string) {
  const value = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

export function useRoutePlanningWorkspace() {
  const repository = useMemo(() => new LocalRoutePlanRepository(), []);
  const [catalog, setCatalog] = useState<RoutePlanSummary[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [activePlan, setActivePlan] = useState<RoutePlan | null>(null);
  const [route, setRoute] = useState<ClosedDrivingRoute | null>(null);
  const [routeStatus, setRouteStatus] = useState<RouteCalculationStatus>("idle");
  const [routeError, setRouteError] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("idle");
  const [adapter, setAdapter] = useState<TencentMapWebAdapter | null>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [mapMessage, setMapMessage] = useState("正在连接腾讯地图…");
  const [selectedControlPointId, setSelectedControlPointId] = useState<string | null>(null);
  const [selectedRouteLegId, setSelectedRouteLegId] = useState<string | null>(null);
  const [pendingControlPointId, setPendingControlPointId] = useState<string | null>(null);
  const [history, setHistory] = useState<RoutePlan[]>([]);
  const calculationToken = useRef(0);
  const calculationPlanId = activePlan?.id;
  const calculationStrategy = activePlan?.strategy;
  const calculationPointsJson = JSON.stringify(
    activePlan?.controlPoints.map(({ id, latitude, longitude }) => ({
      id,
      latitude,
      longitude,
    })) ?? [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCatalog(repository.list());
      setCatalogReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [repository]);

  useEffect(() => {
    let current = true;
    TencentMapWebAdapter.create({
      key: process.env.NEXT_PUBLIC_TENCENT_MAP_KEY ?? "",
    })
      .then((nextAdapter) => {
        if (!current) return;
        setAdapter(nextAdapter);
        setMapStatus("ready");
        setMapMessage("腾讯地图已连接");
        setRouteStatus((status) => status === "failed" ? "updating" : status);
      })
      .catch((error: unknown) => {
        if (!current) return;
        setMapStatus("unavailable");
        setMapMessage(error instanceof Error ? error.message : "腾讯地图暂不可用");
      });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!activePlan) return;
    const timer = window.setTimeout(() => {
      try {
        repository.save(activePlan);
        setCatalog(repository.list());
        setDraftStatus("saved");
      } catch {
        setDraftStatus("failed");
      }
    }, 360);
    return () => window.clearTimeout(timer);
  }, [activePlan, repository]);

  useEffect(() => {
    const token = ++calculationToken.current;
    const calculationPoints = JSON.parse(calculationPointsJson) as Array<
      MapCoordinate & { id: string }
    >;
    if (!calculationPlanId || calculationPoints.length < 2) {
      const timer = window.setTimeout(() => {
        setRoute(null);
        setRouteError(null);
        setRouteStatus(calculationPlanId ? "waiting-for-points" : "idle");
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (!adapter) {
      const timer = window.setTimeout(() => {
        setRouteStatus("failed");
        setRouteError("腾讯地图服务未连接，控制点已保留但暂时无法算路。");
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      setRouteStatus("updating");
      setRouteError(null);
      setRoute(null);
      adapter
        .calculateClosedDrivingRoute(calculationPoints, calculationStrategy ?? "recommend")
        .then((nextRoute) => {
          if (calculationToken.current !== token) return;
          setRoute(nextRoute);
          setRouteStatus("ready");
        })
        .catch((error: unknown) => {
          if (calculationToken.current !== token) return;
          setRouteStatus("failed");
          setRouteError(error instanceof Error ? error.message : "路线计算失败");
        });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [adapter, calculationPlanId, calculationPointsJson, calculationStrategy]);

  const createPlan = useCallback(() => {
    const plan = createRoutePlan(createId("plan"));
    setActivePlan(plan);
    setRoute(null);
    setSelectedControlPointId(null);
    setSelectedRouteLegId(null);
    setPendingControlPointId(null);
    setHistory([]);
    setDraftStatus("saving");
    setRouteStatus("waiting-for-points");
    return plan;
  }, []);

  const loadPlan = useCallback((id: string) => {
    const plan = repository.load(id);
    if (!plan) {
      setCatalog((current) => current.map((item) => item.id === id
        ? { ...item, loadable: false }
        : item));
      return false;
    }
    calculationToken.current += 1;
    setRoute(null);
    setRouteStatus("updating");
    setActivePlan(plan);
    setSelectedControlPointId(null);
    setSelectedRouteLegId(null);
    setPendingControlPointId(null);
    setHistory([]);
    setDraftStatus("saved");
    return true;
  }, [repository]);

  const mutatePlan = useCallback((change: (plan: RoutePlan) => RoutePlan) => {
    setDraftStatus("saving");
    setActivePlan((current) => {
      if (!current) return current;
      setHistory((items) => [...items.slice(-19), current]);
      return reviseRoutePlan(current, change);
    });
  }, []);

  const addControlPoint = useCallback((candidate: {
    name: string;
    address: string;
    coordinate: MapCoordinate;
  }) => {
    const controlPoint: ControlPoint = {
      id: createId("point"),
      name: candidate.name,
      address: candidate.address,
      ...candidate.coordinate,
    };
    setDraftStatus("saving");
    setActivePlan((current) => {
      const base = current ?? createRoutePlan(createId("plan"));
      if (base.controlPoints.length >= 20) return base;
      if (current) setHistory((items) => [...items.slice(-19), current]);
      return reviseRoutePlan(base, (plan) => ({
        ...plan,
        controlPoints: [...plan.controlPoints, controlPoint],
      }));
    });
    setSelectedControlPointId(controlPoint.id);
    return controlPoint.id;
  }, []);

  const addCoordinate = useCallback(async (coordinate: MapCoordinate) => {
    const controlPointId = addControlPoint({
      name: "地图选点",
      address: "地址解析中…",
      coordinate,
    });
    setPendingControlPointId(controlPointId);
    const address = adapter
      ? await adapter.reverseGeocode(coordinate)
      : { name: "地图选点", address: "未识别地址" };
    setDraftStatus("saving");
    setActivePlan((current) => {
      if (!current || !current.controlPoints.some((point) => point.id === controlPointId)) return current;
      return reviseRoutePlan(current, (plan) => ({
        ...plan,
        controlPoints: plan.controlPoints.map((point) => point.id === controlPointId
          ? { ...point, ...address }
          : point),
      }));
    });
  }, [adapter, addControlPoint]);

  const addPlaceCandidate = useCallback((candidate: PlaceCandidate) => {
    setPendingControlPointId(null);
    addControlPoint(candidate);
  }, [addControlPoint]);

  const searchPlaces = useCallback((keyword: string): Promise<PlaceCandidate[]> => {
    if (!adapter) return Promise.reject(new Error(mapMessage));
    return adapter.searchPlaces(keyword);
  }, [adapter, mapMessage]);

  const removeControlPoint = useCallback((id: string) => {
    mutatePlan((plan) => ({
      ...plan,
      controlPoints: plan.controlPoints.filter((point) => point.id !== id),
    }));
    setSelectedControlPointId((current) => current === id ? null : current);
    setPendingControlPointId((current) => current === id ? null : current);
  }, [mutatePlan]);

  useEffect(() => {
    if (!pendingControlPointId) return;
    const removePendingPoint = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      if (isEditing || !["Escape", "Delete", "Backspace"].includes(event.key)) return;
      event.preventDefault();
      removeControlPoint(pendingControlPointId);
    };
    window.addEventListener("keydown", removePendingPoint);
    return () => window.removeEventListener("keydown", removePendingPoint);
  }, [pendingControlPointId, removeControlPoint]);

  const moveControlPoint = useCallback((id: string, direction: -1 | 1) => {
    mutatePlan((plan) => {
      const index = plan.controlPoints.findIndex((point) => point.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= plan.controlPoints.length) return plan;
      const points = [...plan.controlPoints];
      [points[index], points[target]] = [points[target], points[index]];
      return { ...plan, controlPoints: points };
    });
  }, [mutatePlan]);

  const setAsStart = useCallback((id: string) => {
    mutatePlan((plan) => {
      const index = plan.controlPoints.findIndex((point) => point.id === id);
      if (index <= 0) return plan;
      return {
        ...plan,
        controlPoints: [
          ...plan.controlPoints.slice(index),
          ...plan.controlPoints.slice(0, index),
        ],
      };
    });
  }, [mutatePlan]);

  const setStrategy = useCallback((strategy: DrivingStrategy) => {
    mutatePlan((plan) => ({ ...plan, strategy }));
  }, [mutatePlan]);

  const renamePlan = useCallback((name: string) => {
    const normalized = name.trim() || "未命名路线";
    mutatePlan((plan) => ({ ...plan, name: normalized }));
  }, [mutatePlan]);

  const deletePlan = useCallback((id: string) => {
    repository.delete(id);
    setCatalog(repository.list());
    if (activePlan?.id === id) {
      calculationToken.current += 1;
      setActivePlan(null);
      setRoute(null);
      setRouteStatus("idle");
      setHistory([]);
      setPendingControlPointId(null);
    }
  }, [activePlan?.id, repository]);

  const undo = useCallback(() => {
    const previous = history.at(-1);
    if (!previous) return;
    setActivePlan(reviseRoutePlan(previous, (plan) => plan));
    setHistory((items) => items.slice(0, -1));
  }, [history]);

  const selectControlPoint = useCallback((id: string) => {
    setSelectedControlPointId(id);
    setPendingControlPointId((current) => current === id ? current : null);
  }, []);

  return {
    adapter,
    catalog,
    catalogReady,
    activePlan,
    route,
    routeStatus,
    routeError,
    draftStatus,
    mapStatus,
    mapMessage,
    selectedControlPointId,
    selectedRouteLegId,
    pendingControlPointId,
    canUndo: history.length > 0,
    createPlan,
    loadPlan,
    renamePlan,
    deletePlan,
    addPlaceCandidate,
    addCoordinate,
    searchPlaces,
    removeControlPoint,
    moveControlPoint,
    setAsStart,
    setStrategy,
    undo,
    selectControlPoint,
    selectRouteLeg: setSelectedRouteLegId,
  };
}
