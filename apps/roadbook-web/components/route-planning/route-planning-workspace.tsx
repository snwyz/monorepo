"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { ElevationPanel } from "@/components/elevation-analysis/elevation-panel";
import { MapProviderSwitch } from "@/components/map-provider/map-provider-switch";
import { RoutePlanSelector } from "@/components/route-plan-catalog/route-plan-selector";
import { RoutePlanWelcomePanel } from "@/components/route-plan-catalog/route-plan-welcome-panel";
import { RouteMetricsPanel } from "@/components/route-metrics/route-metrics-panel";
import { RouteMap } from "@/components/route-presentation/route-map";
import { PlaceSearch } from "@/components/route-planning/place-search";
import { RouteAddressList } from "@/components/route-planning/route-address-list";
import { RouteCalculationFeedback } from "@/components/route-planning/route-calculation-feedback";
import { RouteStrategySelector } from "@/components/route-planning/route-strategy-selector";
import { AlertIcon, LayersIcon } from "@/components/ui/icons";
import { appToast } from "@/components/ui/toast-store";
import { ROUTE_PLAN_CONTROL_POINT_LIMIT } from "@/domain/route-planning/model";
import { useRoutePlanningWorkspace } from "@/hooks/use-route-planning-workspace";

const ControlPointDeleteConfirmation = lazy(() =>
  import("@/components/route-planning/control-point-delete-confirmation").then(
    (module) => ({ default: module.ControlPointDeleteConfirmation }),
  ),
);

export function RoutePlanningWorkspace() {
  const workspace = useRoutePlanningWorkspace();
  const points = workspace.activePlan?.controlPoints ?? [];
  const controlPointLimitReached =
    points.length >= ROUTE_PLAN_CONTROL_POINT_LIMIT;
  const controlPointLimitMessage = `当前点位已满（${points.length}/${ROUTE_PLAN_CONTROL_POINT_LIMIT}），请先删除一个点位`;
  const searchDisabledReason = controlPointLimitReached
    ? controlPointLimitMessage
    : workspace.mapStatus !== "ready"
      ? "地图服务连接后可搜索"
      : undefined;
  const searchPlaceholder =
    workspace.startPointStatus === "locating"
      ? (workspace.startPointMessage ?? "正在获取当前位置作为起点…")
      : workspace.startPointStatus === "manual-required" && points.length === 0
        ? (workspace.startPointMessage ?? "定位失败，请搜索地点添加起点")
        : points.length === 0
          ? "搜索地点，规划当前位置出发路线"
          : "搜索地点，继续添加控制点";
  const {
    addCoordinate: addCoordinateToPlan,
    clearRouteLegSelection,
    removeControlPoint: removeControlPointFromPlan,
    selectControlPoint,
  } = workspace;
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(
    null,
  );
  const [deleteConfirmationLoaded, setDeleteConfirmationLoaded] =
    useState(false);
  const limitToastPlanIdRef = useRef<string | null>(null);
  const deleteCandidate = points.find(
    (point) => point.id === deleteCandidateId,
  );

  useEffect(() => {
    const activePlanId = workspace.activePlan?.id ?? null;
    if (!controlPointLimitReached || !activePlanId) {
      limitToastPlanIdRef.current = null;
      return;
    }
    if (limitToastPlanIdRef.current === activePlanId) return;
    limitToastPlanIdRef.current = activePlanId;
    appToast.info(controlPointLimitMessage);
  }, [
    controlPointLimitMessage,
    controlPointLimitReached,
    workspace.activePlan?.id,
  ]);

  const addCoordinate = useCallback(
    (coordinate: { latitude: number; longitude: number }) => {
      void addCoordinateToPlan(coordinate);
    },
    [addCoordinateToPlan],
  );

  const selectMapControlPoint = useCallback(
    (id: string) => {
      selectControlPoint(id);
    },
    [selectControlPoint],
  );

  const requestControlPointRemoval = useCallback((id: string) => {
    setDeleteConfirmationLoaded(true);
    setDeleteCandidateId(id);
  }, []);

  const confirmControlPointRemoval = useCallback(() => {
    if (!deleteCandidateId) return;
    removeControlPointFromPlan(deleteCandidateId);
    setDeleteCandidateId(null);
  }, [deleteCandidateId, removeControlPointFromPlan]);

  useEffect(() => {
    const removableControlPointId =
      workspace.pendingControlPointId ?? workspace.selectedControlPointId;
    if (!removableControlPointId || deleteCandidateId) return;
    const requestRemovalWithKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing =
        target?.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      const deleteSelectedPoint = ["Delete", "Backspace"].includes(event.key);
      const cancelPendingPoint =
        event.key === "Escape" && workspace.pendingControlPointId;
      if (isEditing || (!deleteSelectedPoint && !cancelPendingPoint)) return;
      event.preventDefault();
      requestControlPointRemoval(removableControlPointId);
    };
    window.addEventListener("keydown", requestRemovalWithKeyboard);
    return () =>
      window.removeEventListener("keydown", requestRemovalWithKeyboard);
  }, [
    deleteCandidateId,
    requestControlPointRemoval,
    workspace.pendingControlPointId,
    workspace.selectedControlPointId,
  ]);

  useEffect(() => {
    if (!workspace.selectedRouteLegId) return;
    const clearRouteSelectionWithKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing =
        target?.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      const isDialogOpen = Boolean(
        target?.closest('[role="alertdialog"], [role="dialog"]'),
      );
      if (isEditing || isDialogOpen || event.key !== "Escape") return;
      event.preventDefault();
      clearRouteLegSelection();
    };
    window.addEventListener("keydown", clearRouteSelectionWithKeyboard);
    return () =>
      window.removeEventListener("keydown", clearRouteSelectionWithKeyboard);
  }, [clearRouteLegSelection, workspace.selectedRouteLegId]);

  return (
    <main className="planning-workspace">
      <RouteMap
        adapter={workspace.adapter}
        provider={workspace.mapProvider}
        controlPoints={points}
        route={workspace.route}
        selectedControlPointId={workspace.selectedControlPointId}
        selectedRouteLegId={workspace.selectedRouteLegId}
        routeUpdating={workspace.routeStatus === "updating"}
        focusControlPointRequest={workspace.mapFocusRequest}
        fitRoutePlanRequest={workspace.fitRoutePlanRequest}
        onDoubleClick={addCoordinate}
        onClearRouteLegSelection={clearRouteLegSelection}
        onSelectControlPoint={selectMapControlPoint}
        onSelectRouteLeg={workspace.selectRouteLeg}
        onInsertRouteLegControlPoint={workspace.insertRouteLegControlPoint}
      />

      <MapProviderSwitch
        provider={workspace.mapProvider}
        loading={workspace.mapStatus === "loading"}
        onProviderChange={workspace.setMapProvider}
      />

      {workspace.routeStatus === "updating" && points.length >= 2 ? (
        <RouteCalculationFeedback controlPointCount={points.length} />
      ) : null}

      <div className="workspace-topbar">
        <RoutePlanSelector
          catalog={workspace.catalog}
          activePlan={workspace.activePlan}
          onCreate={workspace.createPlan}
          onLoad={workspace.loadPlan}
          onRename={workspace.renamePlan}
          onDelete={workspace.deletePlan}
          onClearAll={workspace.clearPlans}
        />
        <PlaceSearch
          key={searchDisabledReason ?? "search-enabled"}
          disabled={Boolean(searchDisabledReason)}
          disabledReason={searchDisabledReason}
          placeholder={searchPlaceholder}
          onSearch={workspace.searchPlaces}
          onSelect={workspace.addPlaceCandidate}
        />
        {workspace.activePlan ? (
          <RouteStrategySelector
            strategy={workspace.activePlan.strategy}
            routeStatus={workspace.routeStatus}
            draftStatus={workspace.draftStatus}
            error={workspace.routeError}
            canUndo={workspace.canUndo}
            onStrategyChange={workspace.setStrategy}
            onUndo={workspace.undo}
          />
        ) : (
          <div className="workspace-mode widget">
            <LayersIcon />
            <span>地图工作台</span>
          </div>
        )}
      </div>

      {workspace.catalogReady &&
      !workspace.activePlan &&
      workspace.catalog.length === 0 ? (
        <RoutePlanWelcomePanel onCreate={workspace.createPlan} />
      ) : null}

      {workspace.mapStatus === "unavailable" ? (
        <section className="map-unavailable widget" role="status">
          <AlertIcon />
          <span>
            <strong>
              {workspace.mapProvider === "amap" ? "高德" : "腾讯"}地图尚未启用
            </strong>
            <small>{workspace.mapMessage}</small>
          </span>
        </section>
      ) : null}

      {workspace.activePlan && points.length ? (
        <RouteAddressList
          provider={workspace.mapProvider}
          controlPoints={points}
          selectedControlPointId={workspace.selectedControlPointId}
          selectedRouteLegId={workspace.selectedRouteLegId}
          pendingControlPointId={workspace.pendingControlPointId}
          onSelectControlPoint={selectControlPoint}
          onSelectRouteLeg={workspace.selectRouteLeg}
          onReorder={workspace.reorderControlPoint}
          onRemove={requestControlPointRemoval}
        />
      ) : null}

      {deleteConfirmationLoaded ? (
        <Suspense fallback={null}>
          <ControlPointDeleteConfirmation
            open={Boolean(deleteCandidate)}
            pointName={deleteCandidate?.name ?? null}
            onOpenChange={(open) => {
              if (!open) setDeleteCandidateId(null);
            }}
            onConfirm={confirmControlPointRemoval}
          />
        </Suspense>
      ) : null}

      {workspace.route ? (
        <RouteMetricsPanel
          route={workspace.route}
          provider={workspace.mapProvider}
          controlPoints={points}
          selectedRouteLegId={workspace.selectedRouteLegId}
        />
      ) : null}

      <ElevationPanel hasRoute={Boolean(workspace.route)} />
    </main>
  );
}
