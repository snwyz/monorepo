"use client";

import type { MapCoordinate, PlaceCandidate, RouteTravelMode } from "@roadbook/map/web";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createRoutePlan, insertControlPointIntoRouteLeg, ROUTE_PLAN_CONTROL_POINT_LIMIT,
  type ControlPoint, type RoutePlan,
} from "@/domain/route-planning/model";
import type { PublishedRouteContext } from "@/domain/route-planning/calculation-context";
import { changeRouteLegTravelMode, getRouteLegIds, inheritInsertedRouteLegTravelMode } from "@/domain/route-planning/route-leg-travel-mode";
import { queryRouteCalculation } from "@/application/route-calculation/route-calculation-actor";
import { createRoutePlanningRuntime } from "@/infrastructure/route-plan/create-route-planning-runtime";

function createId(prefix: string) {
  const value = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}
type RouteStartPointStatus = "idle" | "locating" | "ready" | "manual-required";

export function useRoutePlanningWorkspace() {
  const [runtime] = useState(createRoutePlanningRuntime);
  const { activePlan, catalog, catalogReady, history, activation } = useSyncExternalStore(
    runtime.session.state.subscribe, runtime.session.state.getState, runtime.session.state.getInitialState,
  );
  const map = useSyncExternalStore(runtime.map.state.subscribe, runtime.map.state.getState, runtime.map.state.getInitialState);
  const receipt = useSyncExternalStore(runtime.persistence.state.subscribe, runtime.persistence.state.getState, runtime.persistence.state.getInitialState);
  const calculation = useSyncExternalStore(runtime.calculation.subscribe, runtime.calculation.getSnapshot, runtime.calculation.getSnapshot);
  const result = queryRouteCalculation(calculation);
  const adapter = map.adapter;
  const mapMessage = map.message;
  const [selection, setSelection] = useState<{
    activation: number; pointId: string | null; legId: string | null; pendingId: string | null;
  }>({ activation: 0, pointId: null, legId: null, pendingId: null });
  const selectedControlPointId = selection.activation === activation ? selection.pointId : null;
  const selectedRouteLegId = selection.activation === activation && activePlan && selection.legId
    && getRouteLegIds(activePlan.controlPoints).includes(selection.legId) ? selection.legId : null;
  const pendingControlPointId = selection.activation === activation ? selection.pendingId : null;
  const setSelectedControlPointId = useCallback((next: string | null | ((id: string | null) => string | null)) => setSelection((s) => ({ ...s, activation: runtime.session.state.getState().activation, pointId: typeof next === "function" ? next(s.pointId) : next })), [runtime]);
  const setSelectedRouteLegId = useCallback((next: string | null | ((id: string | null) => string | null)) => setSelection((s) => ({ ...s, activation: runtime.session.state.getState().activation, legId: typeof next === "function" ? next(s.legId) : next })), [runtime]);
  const setPendingControlPointId = useCallback((next: string | null | ((id: string | null) => string | null)) => setSelection((s) => ({ ...s, activation: runtime.session.state.getState().activation, pendingId: typeof next === "function" ? next(s.pendingId) : next })), [runtime]);
  const [mapFocusRequest, setMapFocusRequest] = useState<{ id: string; sequence: number } | null>(null);
  const [fitRoutePlanRequest, setFitRoutePlanRequest] = useState<{ planId: string; sequence: number } | null>(null);
  const [startPoint, setStartPoint] = useState<{ activation: number; generation: number; status: RouteStartPointStatus; message: string | null }>({ activation: 0, generation: 0, status: "idle", message: null });
  const startPointCurrent = startPoint.activation === activation && startPoint.generation === map.generation;
  const startPointStatus = startPointCurrent ? startPoint.status : activePlan?.controlPoints.length ? "ready" : activePlan ? "manual-required" : "idle";
  const startPointMessage = startPointCurrent ? startPoint.message : activePlan && !activePlan.controlPoints.length ? "请搜索地点添加起点" : null;
  const setStartPointStatus = useCallback((status: RouteStartPointStatus) => setStartPoint((current) => ({ ...current, status,
    activation: runtime.session.state.getState().activation, generation: runtime.map.state.getState().generation,
  })), [runtime]);
  const setStartPointMessage = useCallback((message: string | null) => setStartPoint((current) => ({ ...current, message,
    activation: runtime.session.state.getState().activation, generation: runtime.map.state.getState().generation,
  })), [runtime]);
  const pendingStartPointRef = useRef<{ planId: string; activation: number; generation: number; promise: Promise<boolean> } | null>(null);
  const mapFocusSequence = useRef(0);
  const fitRoutePlanSequence = useRef(0);
  useEffect(() => { runtime.start(); return runtime.dispose; }, [runtime]);
  const resetSelection = useCallback(() => {
    setSelection({ activation: runtime.session.state.getState().activation, pointId: null, legId: null, pendingId: null });
    pendingStartPointRef.current = null;
    setMapFocusRequest(null); setFitRoutePlanRequest(null);
    setStartPointStatus("idle"); setStartPointMessage(null);
  }, [runtime, setStartPointMessage, setStartPointStatus]);
  const completeAddress = useCallback(async (planId: string, pointId: string, coordinate: MapCoordinate, fallback: string) => {
    const inputActivation = runtime.session.state.getState().activation;
    const inputGeneration = runtime.map.state.getState().generation;
    let address = { name: fallback, address: "未识别地址" };
    try { address = await runtime.map.state.getState().adapter?.reverseGeocode(coordinate) ?? address; }
    catch { /* 地址失败保留坐标，不影响路线编辑和计算。 */ }
    if (runtime.session.state.getState().activation !== inputActivation || runtime.map.state.getState().generation !== inputGeneration) return;
    runtime.session.edit((plan) => plan.id === planId && plan.controlPoints.some((point) => point.id === pointId)
      ? { ...plan, controlPoints: plan.controlPoints.map((point) => point.id === pointId ? { ...point, ...address } : point) }
      : plan, false);
  }, [runtime]);

  const appendControlPoint = useCallback((
    planId: string,
    candidate: {
      name: string;
      address: string;
      coordinate: MapCoordinate;
    },
    recordHistory = true,
  ) => {
    const current = runtime.session.state.getState().activePlan;
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
    runtime.session.edit((plan) => ({
      ...plan, controlPoints: [...plan.controlPoints, controlPoint],
    }), recordHistory);
    return controlPoint.id;
  }, [runtime]);

  const startPlanAtCurrentLocation = useCallback((planId: string) => {
    if (!adapter) {
      setStartPointStatus("manual-required");
      setStartPointMessage("地图服务尚未连接，请搜索地点添加起点");
      return Promise.resolve(false);
    }
    const originActivation = runtime.session.state.getState().activation;
    const originGeneration = runtime.map.state.getState().generation;
    const current = () => runtime.session.state.getState().activation === originActivation
      && runtime.map.state.getState().generation === originGeneration;
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
        if (!current()) return false;
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
        if (current() && runtime.session.state.getState().activePlan?.id === planId) {
          const reason = error instanceof Error ? error.message : "无法获取精确位置";
          setStartPointStatus("manual-required");
          setStartPointMessage(
            reason.includes("添加起点") ? reason : `${reason}，请搜索地点添加起点`,
          );
        }
        return false;
      }
    })();
    pendingStartPointRef.current = { planId, activation: originActivation, generation: originGeneration, promise };
    void promise.finally(() => {
      if (pendingStartPointRef.current?.promise === promise) {
        pendingStartPointRef.current = null;
      }
    });
    return promise;
  }, [adapter, appendControlPoint, runtime, setSelectedControlPointId, setStartPointMessage, setStartPointStatus]);

  const createPlan = useCallback(() => {
    const plan = createRoutePlan(createId("plan"));
    if (!runtime.session.create(plan)) return null;
    resetSelection();
    void startPlanAtCurrentLocation(plan.id);
    return plan;
  }, [resetSelection, runtime, startPlanAtCurrentLocation]);

  const loadPlan = useCallback((id: string) => {
    const plan = runtime.session.load(id);
    if (!plan) return false;
    resetSelection();
    setSelectedControlPointId(plan.controlPoints[0]?.id ?? null);
    fitRoutePlanSequence.current += 1;
    setFitRoutePlanRequest({ planId: plan.id, sequence: fitRoutePlanSequence.current });
    if (plan.controlPoints.length === 0) void startPlanAtCurrentLocation(plan.id);
    else { setStartPointStatus("ready"); setStartPointMessage(null); }
    return true;
  }, [resetSelection, runtime, setSelectedControlPointId, setStartPointMessage, setStartPointStatus, startPlanAtCurrentLocation]);

  const mutatePlan = useCallback((change: (plan: RoutePlan) => RoutePlan) => {
    runtime.session.edit(change);
  }, [runtime]);

  const ensurePlanReadyForControlPoint = useCallback(async () => {
    let plan = runtime.session.state.getState().activePlan;
    if (!plan) plan = createPlan();
    if (!plan) return null;
    let pendingStartPoint = pendingStartPointRef.current;
    if (pendingStartPoint?.activation !== runtime.session.state.getState().activation
      || pendingStartPoint?.generation !== runtime.map.state.getState().generation) pendingStartPoint = null;
    if (
      !pendingStartPoint
      && plan.controlPoints.length === 0
      && startPointStatus !== "manual-required"
    ) {
      const promise = startPlanAtCurrentLocation(plan.id);
      pendingStartPoint = { planId: plan.id, activation: runtime.session.state.getState().activation, generation: runtime.map.state.getState().generation, promise };
    }
    if (pendingStartPoint?.planId === plan.id) {
      await pendingStartPoint.promise;
    }
    return runtime.session.state.getState().activePlan?.id === plan.id ? plan.id : null;
  }, [createPlan, runtime, startPlanAtCurrentLocation, startPointStatus]);

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
    await completeAddress(planId, controlPointId, coordinate, "地图选点");
  }, [appendControlPoint, completeAddress, ensurePlanReadyForControlPoint, setPendingControlPointId, setSelectedControlPointId]);

  const addPlaceCandidate = useCallback(async (candidate: PlaceCandidate) => {
    const planId = await ensurePlanReadyForControlPoint();
    if (!planId) return;
    setPendingControlPointId(null);
    const controlPointId = appendControlPoint(planId, candidate);
    if (!controlPointId) return;
    setSelectedControlPointId(controlPointId);
    mapFocusSequence.current += 1;
    setMapFocusRequest({ id: controlPointId, sequence: mapFocusSequence.current });
  }, [appendControlPoint, ensurePlanReadyForControlPoint, setPendingControlPointId, setSelectedControlPointId]);

  const insertPlaceCandidate = useCallback((
    target: { planId: string; fromId: string; toId: string; routeContext?: PublishedRouteContext },
    candidate: PlaceCandidate,
  ) => {
    const current = runtime.session.state.getState().activePlan;
    if (!current || current.id !== target.planId) return false;
    if (target.routeContext) {
      const published = queryRouteCalculation(runtime.calculation.getSnapshot()).published;
      if (!published || published.requestBatch !== target.routeContext.requestBatch || published.route !== target.routeContext.route) return false;
    }
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
    runtime.session.edit((plan) => inheritInsertedRouteLegTravelMode(plan, target.fromId, target.toId, point, controlPoints));
    setPendingControlPointId(null);
    setSelectedControlPointId(point.id);
    setSelectedRouteLegId(null);
    mapFocusSequence.current += 1;
    setMapFocusRequest({ id: point.id, sequence: mapFocusSequence.current });
    return true;
  }, [runtime, setPendingControlPointId, setSelectedControlPointId, setSelectedRouteLegId]);

  const insertRouteLegControlPoint = useCallback(async (
    routeLegId: string,
    coordinate: MapCoordinate,
  ) => {
    const current = runtime.session.state.getState().activePlan;
    const leg = queryRouteCalculation(runtime.calculation.getSnapshot()).published?.route?.legs.find((item) => item.id === routeLegId);
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
    const nextPlan = runtime.session.edit((plan) => inheritInsertedRouteLegTravelMode(plan, leg.fromControlPointId, leg.toControlPointId, controlPoint, nextControlPoints));
    if (!nextPlan) return;
    setSelectedControlPointId(controlPoint.id);
    setSelectedRouteLegId(null);
    setPendingControlPointId(controlPoint.id);

    await completeAddress(nextPlan.id, controlPoint.id, coordinate, "路线调整点");
  }, [completeAddress, runtime, setPendingControlPointId, setSelectedControlPointId, setSelectedRouteLegId]);

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
  }, [mutatePlan, setPendingControlPointId, setSelectedControlPointId]);

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

  const setStrategy = useCallback((strategy: RoutePlan["strategy"]) => {
    mutatePlan((plan) => ({ ...plan, strategy }));
  }, [mutatePlan]);

  const setRouteLegTravelMode = useCallback((legId: string, mode: RouteTravelMode) => {
    // 交通方式编辑保留当前详情；流程隔离旧结果并更新同一方案修订。
    runtime.session.edit((plan) => changeRouteLegTravelMode(plan, legId, mode));
  }, [runtime]);

  const renamePlan = useCallback((name: string) => {
    const normalized = name.trim() || "未命名路线";
    mutatePlan((plan) => ({ ...plan, name: normalized }));
  }, [mutatePlan]);

  const selectControlPoint = useCallback((id: string) => {
    setSelectedControlPointId(id);
    setSelectedRouteLegId(null);
    setPendingControlPointId((current) => current === id ? current : null);
    mapFocusSequence.current += 1;
    setMapFocusRequest({ id, sequence: mapFocusSequence.current });
  }, [setPendingControlPointId, setSelectedControlPointId, setSelectedRouteLegId]);

  const selectRouteLeg = useCallback((id: string) => {
    setSelectedRouteLegId((current) => current === id ? null : id);
    setSelectedControlPointId(null);
    setPendingControlPointId(null);
  }, [setPendingControlPointId, setSelectedControlPointId, setSelectedRouteLegId]);

  const clearRouteLegSelection = useCallback(() => {
    setSelectedRouteLegId(null);
  }, [setSelectedRouteLegId]);

  const deletePlan = useCallback((id: string) => {
    runtime.session.delete(id);
    if (!runtime.session.state.getState().activePlan) resetSelection();
  }, [resetSelection, runtime]);
  const clearPlans = useCallback(() => { runtime.session.clear(); resetSelection(); }, [resetSelection, runtime]);
  const undo = useCallback(() => runtime.session.undo(), [runtime]);
  const toggleReturnRoute = useCallback(() => {
    setSelectedRouteLegId(null); runtime.calculation.send({ type: "TOGGLE_RETURN" });
  }, [runtime, setSelectedRouteLegId]);
  const cancelRouteCalculation = useCallback(() => runtime.calculation.send({ type: "CANCEL" }), [runtime]);
  const retryRouteCalculation = useCallback(() => runtime.calculation.send({ type: "RETRY" }), [runtime]);
  const retrySave = useCallback(() => {
    const plan = runtime.session.state.getState().activePlan;
    if (plan) runtime.persistence.flush(plan.id);
  }, [runtime]);
  const draftStatus = !activePlan ? "idle" : receipt.planId === activePlan.id && receipt.revision === activePlan.revision
    ? receipt.status : runtime.persistence.hasPending(activePlan.id) ? "saving" : "saved";
  return {
    ...result, routeContext: result.published,
    adapter, mapProvider: map.provider, mapStatus: map.status, mapMessage: map.message,
    setMapProvider: runtime.map.select,
    activePlan, catalog, catalogReady, draftStatus, retrySave,
    selectedControlPointId, selectedRouteLegId, pendingControlPointId,
    mapFocusRequest, fitRoutePlanRequest, startPointStatus, startPointMessage,
    canUndo: history.length > 0, createPlan, loadPlan, renamePlan, deletePlan, clearPlans,
    addPlaceCandidate, addCoordinate, insertRouteLegControlPoint, insertPlaceCandidate,
    searchPlaces, removeControlPoint, reorderControlPoint, setStrategy, undo,
    selectControlPoint, selectRouteLeg, clearRouteLegSelection, setRouteLegTravelMode,
    toggleReturnRoute, cancelRouteCalculation, retryRouteCalculation,
  };
}
