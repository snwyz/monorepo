"use client";

import {
  AmapWebAdapter,
  TencentMapWebAdapter,
  type ClosedDrivingRoute,
  type DrivingStrategy,
  type MapCoordinate,
  type PlaceCandidate,
  type WebMapAdapter,
  type WebMapProvider,
} from "@roadbook/map/web";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createRoutePlan,
  insertControlPointIntoRouteLeg,
  reviseRoutePlan,
  ROUTE_PLAN_CONTROL_POINT_LIMIT,
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

type RouteStartPointStatus = "idle" | "locating" | "ready" | "manual-required";

export function useRoutePlanningWorkspace() {
  const repository = useMemo(() => new LocalRoutePlanRepository(), []);
  const [catalog, setCatalog] = useState<RoutePlanSummary[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [activePlan, setActivePlan] = useState<RoutePlan | null>(null);
  const [route, setRoute] = useState<ClosedDrivingRoute | null>(null);
  const [routeStatus, setRouteStatus] = useState<RouteCalculationStatus>("idle");
  const [routeError, setRouteError] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("idle");
  const [mapProvider, setMapProviderState] = useState<WebMapProvider>("amap");
  const [adapter, setAdapter] = useState<WebMapAdapter | null>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [mapMessage, setMapMessage] = useState("正在连接高德地图…");
  const [selectedControlPointId, setSelectedControlPointId] = useState<string | null>(null);
  const [selectedRouteLegId, setSelectedRouteLegId] = useState<string | null>(null);
  const [pendingControlPointId, setPendingControlPointId] = useState<string | null>(null);
  const [mapFocusRequest, setMapFocusRequest] = useState<{ id: string; sequence: number } | null>(null);
  const [fitRoutePlanRequest, setFitRoutePlanRequest] = useState<{ planId: string; sequence: number } | null>(null);
  const [history, setHistory] = useState<RoutePlan[]>([]);
  const [startPointStatus, setStartPointStatus] = useState<RouteStartPointStatus>("idle");
  const [startPointMessage, setStartPointMessage] = useState<string | null>(null);
  const activePlanRef = useRef<RoutePlan | null>(null);
  const routeRef = useRef<ClosedDrivingRoute | null>(null);
  const adapterRef = useRef<WebMapAdapter | null>(null);
  const pendingStartPointRef = useRef<{
    planId: string;
    promise: Promise<boolean>;
  } | null>(null);
  const calculationToken = useRef(0);
  const mapFocusSequence = useRef(0);
  const fitRoutePlanSequence = useRef(0);
  const changeMapProvider = useCallback((provider: WebMapProvider) => {
    calculationToken.current += 1;
    setAdapter(null);
    setMapStatus("loading");
    setMapMessage(`正在连接${provider === "amap" ? "高德地图" : "腾讯地图"}…`);
    setRouteStatus((status) => status === "idle" || status === "waiting-for-points"
      ? status
      : "updating");
    setMapProviderState(provider);
  }, []);
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
    activePlanRef.current = activePlan;
  }, [activePlan]);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    adapterRef.current = adapter;
  }, [adapter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCatalog(repository.list());
      setCatalogReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [repository]);

  useEffect(() => {
    let current = true;
    const providerName = mapProvider === "amap" ? "高德地图" : "腾讯地图";
    const adapterRequest = mapProvider === "amap"
      ? AmapWebAdapter.create({
        key: process.env.NEXT_PUBLIC_AMAP_KEY ?? "",
      })
      : TencentMapWebAdapter.create({
        key: process.env.NEXT_PUBLIC_TENCENT_MAP_KEY ?? "",
      });
    adapterRequest
      .then((nextAdapter) => {
        if (!current) return;
        setAdapter(nextAdapter);
        setMapStatus("ready");
        setMapMessage(`${providerName}已连接`);
        setRouteStatus((status) => status === "failed" ? "updating" : status);
      })
      .catch((error: unknown) => {
        if (!current) return;
        setMapStatus("unavailable");
        setMapMessage(error instanceof Error ? error.message : `${providerName}暂不可用`);
      });
    return () => {
      current = false;
    };
  }, [mapProvider]);

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
        if (mapStatus === "loading") {
          setRouteStatus("updating");
          setRouteError(null);
        } else {
          setRouteStatus("failed");
          setRouteError(`${mapProvider === "amap" ? "高德" : "腾讯"}地图服务未连接，控制点已保留但暂时无法算路。`);
        }
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      setRouteStatus("updating");
      setRouteError(null);
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
  }, [adapter, calculationPlanId, calculationPointsJson, calculationStrategy, mapProvider, mapStatus]);

  const initializePlan = useCallback(() => {
    const plan = createRoutePlan(createId("plan"));
    activePlanRef.current = plan;
    setActivePlan(plan);
    setRoute(null);
    setSelectedControlPointId(null);
    setSelectedRouteLegId(null);
    setPendingControlPointId(null);
    setMapFocusRequest(null);
    setFitRoutePlanRequest(null);
    setHistory([]);
    setDraftStatus("saving");
    setRouteStatus("waiting-for-points");
    return plan;
  }, []);

  const appendControlPoint = useCallback((
    planId: string,
    candidate: {
      name: string;
      address: string;
      coordinate: MapCoordinate;
    },
    recordHistory = true,
  ) => {
    const current = activePlanRef.current;
    if (
      !current
      || current.id !== planId
      || current.controlPoints.length >= ROUTE_PLAN_CONTROL_POINT_LIMIT
    ) return null;
    const controlPoint: ControlPoint = {
      id: createId("point"),
      name: candidate.name,
      address: candidate.address,
      ...candidate.coordinate,
    };
    if (recordHistory) {
      setHistory((items) => [...items.slice(-19), current]);
    }
    const nextPlan = reviseRoutePlan(current, (plan) => ({
      ...plan,
      controlPoints: [...plan.controlPoints, controlPoint],
    }));
    activePlanRef.current = nextPlan;
    setActivePlan(nextPlan);
    setDraftStatus("saving");
    return controlPoint.id;
  }, []);

  const startPlanAtCurrentLocation = useCallback((planId: string) => {
    if (!adapter) {
      setStartPointStatus("manual-required");
      setStartPointMessage("地图服务尚未连接，请搜索地点添加起点");
      return Promise.resolve(false);
    }
    setStartPointStatus("locating");
    setStartPointMessage("正在获取当前位置作为起点…");
    const promise = (async () => {
      try {
        const location = await adapter.resolveCurrentLocation();
        if (location.approximate) {
          throw new Error("无法获取精确位置，请搜索地点添加起点");
        }
        let address = "当前位置";
        try {
          const resolvedAddress = await adapter.reverseGeocode(location.coordinate);
          address = resolvedAddress.address || resolvedAddress.name || address;
        } catch {
          // 精确坐标已可用时，逆地址失败不应阻断起点创建。
        }
        const controlPointId = appendControlPoint(planId, {
          name: "当前位置",
          address,
          coordinate: location.coordinate,
        }, false);
        if (!controlPointId) return false;
        setSelectedControlPointId(controlPointId);
        mapFocusSequence.current += 1;
        setMapFocusRequest({ id: controlPointId, sequence: mapFocusSequence.current });
        setStartPointStatus("ready");
        setStartPointMessage(null);
        return true;
      } catch (error) {
        if (activePlanRef.current?.id === planId) {
          const reason = error instanceof Error ? error.message : "无法获取精确位置";
          setStartPointStatus("manual-required");
          setStartPointMessage(
            reason.includes("添加起点") ? reason : `${reason}，请搜索地点添加起点`,
          );
        }
        return false;
      }
    })();
    pendingStartPointRef.current = { planId, promise };
    void promise.finally(() => {
      if (pendingStartPointRef.current?.planId === planId) {
        pendingStartPointRef.current = null;
      }
    });
    return promise;
  }, [adapter, appendControlPoint]);

  const createPlan = useCallback(() => {
    const plan = initializePlan();
    void startPlanAtCurrentLocation(plan.id);
    return plan;
  }, [initializePlan, startPlanAtCurrentLocation]);

  const loadPlan = useCallback((id: string) => {
    const plan = repository.load(id);
    if (!plan) {
      setCatalog((current) => current.map((item) => item.id === id
        ? { ...item, loadable: false }
        : item));
      return false;
    }
    calculationToken.current += 1;
    activePlanRef.current = plan;
    setRoute(null);
    setRouteStatus("updating");
    setActivePlan(plan);
    setSelectedControlPointId(plan.controlPoints[0]?.id ?? null);
    setSelectedRouteLegId(null);
    setPendingControlPointId(null);
    setMapFocusRequest(null);
    fitRoutePlanSequence.current += 1;
    setFitRoutePlanRequest({
      planId: plan.id,
      sequence: fitRoutePlanSequence.current,
    });
    setHistory([]);
    setDraftStatus("saved");
    if (plan.controlPoints.length === 0) {
      void startPlanAtCurrentLocation(plan.id);
    } else {
      setStartPointStatus("ready");
      setStartPointMessage(null);
    }
    return true;
  }, [repository, startPlanAtCurrentLocation]);

  const mutatePlan = useCallback((change: (plan: RoutePlan) => RoutePlan) => {
    setDraftStatus("saving");
    setActivePlan((current) => {
      if (!current) return current;
      setHistory((items) => [...items.slice(-19), current]);
      const nextPlan = reviseRoutePlan(current, change);
      activePlanRef.current = nextPlan;
      return nextPlan;
    });
  }, []);

  const ensurePlanReadyForControlPoint = useCallback(async () => {
    let plan = activePlanRef.current;
    if (!plan) plan = createPlan();
    let pendingStartPoint = pendingStartPointRef.current;
    if (
      !pendingStartPoint
      && plan.controlPoints.length === 0
      && startPointStatus !== "manual-required"
    ) {
      const promise = startPlanAtCurrentLocation(plan.id);
      pendingStartPoint = { planId: plan.id, promise };
    }
    if (pendingStartPoint?.planId === plan.id) {
      await pendingStartPoint.promise;
    }
    return activePlanRef.current?.id === plan.id ? plan.id : null;
  }, [createPlan, startPlanAtCurrentLocation, startPointStatus]);

  const addCoordinate = useCallback(async (coordinate: MapCoordinate) => {
    const planId = await ensurePlanReadyForControlPoint();
    if (!planId) return;
    const controlPointId = appendControlPoint(planId, {
      name: "地图选点",
      address: "地址解析中…",
      coordinate,
    });
    if (!controlPointId) return;
    setSelectedControlPointId(controlPointId);
    setPendingControlPointId(controlPointId);
    const address = adapter
      ? await adapter.reverseGeocode(coordinate)
      : { name: "地图选点", address: "未识别地址" };
    setDraftStatus("saving");
    setActivePlan((current) => {
      if (!current || !current.controlPoints.some((point) => point.id === controlPointId)) return current;
      const nextPlan = reviseRoutePlan(current, (plan) => ({
        ...plan,
        controlPoints: plan.controlPoints.map((point) => point.id === controlPointId
          ? { ...point, ...address }
          : point),
      }));
      activePlanRef.current = nextPlan;
      return nextPlan;
    });
  }, [adapter, appendControlPoint, ensurePlanReadyForControlPoint]);

  const addPlaceCandidate = useCallback(async (candidate: PlaceCandidate) => {
    const planId = await ensurePlanReadyForControlPoint();
    if (!planId) return;
    setPendingControlPointId(null);
    const controlPointId = appendControlPoint(planId, candidate);
    if (!controlPointId) return;
    setSelectedControlPointId(controlPointId);
    mapFocusSequence.current += 1;
    setMapFocusRequest({ id: controlPointId, sequence: mapFocusSequence.current });
  }, [appendControlPoint, ensurePlanReadyForControlPoint]);

  const insertPlaceCandidate = useCallback((
    target: { planId: string; fromId: string; toId: string },
    candidate: PlaceCandidate,
  ) => {
    const current = activePlanRef.current;
    if (!current || current.id !== target.planId) return false;
    const point: ControlPoint = {
      id: createId("point"),
      name: candidate.name,
      address: candidate.address,
      ...candidate.coordinate,
    };
    const controlPoints = insertControlPointIntoRouteLeg(
      current.controlPoints, target.fromId, target.toId, point,
    );
    if (!controlPoints) return false;
    setHistory((items) => [...items.slice(-19), current]);
    const nextPlan = reviseRoutePlan(current, (plan) => ({ ...plan, controlPoints }));
    activePlanRef.current = nextPlan;
    setActivePlan(nextPlan);
    setDraftStatus("saving");
    setPendingControlPointId(null);
    setSelectedControlPointId(point.id);
    setSelectedRouteLegId(null);
    mapFocusSequence.current += 1;
    setMapFocusRequest({ id: point.id, sequence: mapFocusSequence.current });
    return true;
  }, []);

  const insertRouteLegControlPoint = useCallback(async (
    routeLegId: string,
    coordinate: MapCoordinate,
  ) => {
    const current = activePlanRef.current;
    const leg = routeRef.current?.legs.find((item) => item.id === routeLegId);
    if (!current || !leg) return;

    const controlPoint: ControlPoint = {
      id: createId("point"),
      name: "路线调整点",
      address: "地址解析中…",
      ...coordinate,
    };
    const nextControlPoints = insertControlPointIntoRouteLeg(
      current.controlPoints,
      leg.fromControlPointId,
      leg.toControlPointId,
      controlPoint,
    );
    if (!nextControlPoints) return;
    setHistory((items) => [...items.slice(-19), current]);
    const nextPlan = reviseRoutePlan(current, (plan) => ({
      ...plan,
      controlPoints: nextControlPoints,
    }));
    activePlanRef.current = nextPlan;
    setActivePlan(nextPlan);
    setSelectedControlPointId(controlPoint.id);
    setSelectedRouteLegId(null);
    setPendingControlPointId(controlPoint.id);
    setDraftStatus("saving");

    const addressAdapter = adapterRef.current;
    const address = addressAdapter
      ? await addressAdapter.reverseGeocode(coordinate)
      : { name: "路线调整点", address: "未识别地址" };
    setActivePlan((plan) => {
      if (!plan || plan.id !== nextPlan.id) return plan;
      if (!plan.controlPoints.some((point) => point.id === controlPoint.id)) return plan;
      const resolvedPlan = reviseRoutePlan(plan, (draft) => ({
        ...draft,
        controlPoints: draft.controlPoints.map((point) => point.id === controlPoint.id
          ? { ...point, ...address }
          : point),
      }));
      activePlanRef.current = resolvedPlan;
      return resolvedPlan;
    });
  }, []);

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

  const reorderControlPoint = useCallback((activeId: string, overId: string) => {
    mutatePlan((plan) => {
      const activeIndex = plan.controlPoints.findIndex((point) => point.id === activeId);
      const overIndex = plan.controlPoints.findIndex((point) => point.id === overId);
      if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return plan;
      const points = [...plan.controlPoints];
      const [activePoint] = points.splice(activeIndex, 1);
      points.splice(overIndex, 0, activePoint);
      return { ...plan, controlPoints: points };
    });
  }, [mutatePlan]);

  const setStrategy = useCallback((strategy: DrivingStrategy) => {
    mutatePlan((plan) => ({ ...plan, strategy }));
  }, [mutatePlan]);

  const renamePlan = useCallback((name: string) => {
    const normalized = name.trim() || "未命名路线";
    mutatePlan((plan) => ({ ...plan, name: normalized }));
  }, [mutatePlan]);

  const resetActivePlan = useCallback(() => {
    calculationToken.current += 1;
    activePlanRef.current = null;
    routeRef.current = null;
    pendingStartPointRef.current = null;
    setActivePlan(null);
    setRoute(null);
    setRouteStatus("idle");
    setRouteError(null);
    setDraftStatus("idle");
    setHistory([]);
    setSelectedControlPointId(null);
    setSelectedRouteLegId(null);
    setPendingControlPointId(null);
    setMapFocusRequest(null);
    setFitRoutePlanRequest(null);
    setStartPointStatus("idle");
    setStartPointMessage(null);
  }, []);

  const deletePlan = useCallback((id: string) => {
    repository.delete(id);
    setCatalog(repository.list());
    if (activePlan?.id === id) {
      resetActivePlan();
    }
  }, [activePlan?.id, repository, resetActivePlan]);

  const clearPlans = useCallback(() => {
    repository.clearAll();
    setCatalog([]);
    resetActivePlan();
  }, [repository, resetActivePlan]);

  const undo = useCallback(() => {
    const previous = history.at(-1);
    if (!previous) return;
    const nextPlan = reviseRoutePlan(previous, (plan) => plan);
    activePlanRef.current = nextPlan;
    setActivePlan(nextPlan);
    setHistory((items) => items.slice(0, -1));
  }, [history]);

  const selectControlPoint = useCallback((id: string) => {
    setSelectedControlPointId(id);
    setSelectedRouteLegId(null);
    setPendingControlPointId((current) => current === id ? current : null);
    mapFocusSequence.current += 1;
    setMapFocusRequest({ id, sequence: mapFocusSequence.current });
  }, []);

  const selectRouteLeg = useCallback((id: string) => {
    setSelectedRouteLegId((current) => current === id ? null : id);
    setSelectedControlPointId(null);
    setPendingControlPointId(null);
  }, []);

  const clearRouteLegSelection = useCallback(() => {
    setSelectedRouteLegId(null);
  }, []);

  return {
    adapter,
    mapProvider,
    catalog,
    catalogReady,
    activePlan,
    route,
    routeStatus,
    routeError,
    draftStatus,
    mapStatus,
    mapMessage,
    setMapProvider: changeMapProvider,
    selectedControlPointId,
    selectedRouteLegId,
    pendingControlPointId,
    mapFocusRequest,
    fitRoutePlanRequest,
    startPointStatus,
    startPointMessage,
    canUndo: history.length > 0,
    createPlan,
    loadPlan,
    renamePlan,
    deletePlan,
    clearPlans,
    addPlaceCandidate,
    addCoordinate,
    insertRouteLegControlPoint,
    insertPlaceCandidate,
    searchPlaces,
    removeControlPoint,
    reorderControlPoint,
    setStrategy,
    undo,
    selectControlPoint,
    selectRouteLeg,
    clearRouteLegSelection,
  };
}
