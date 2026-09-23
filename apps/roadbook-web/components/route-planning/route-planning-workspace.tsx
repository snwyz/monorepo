"use client";

import { lazy, Suspense, useCallback, useEffect, useState } from "react";

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
import { useRoutePlanningWorkspace } from "@/hooks/use-route-planning-workspace";

const ControlPointDeleteConfirmation = lazy(() =>
  import("@/components/route-planning/control-point-delete-confirmation").then(
    (module) => ({ default: module.ControlPointDeleteConfirmation }),
  ),
);

export function RoutePlanningWorkspace() {
  const workspace = useRoutePlanningWorkspace();
  const points = workspace.activePlan?.controlPoints ?? [];
  const {
    addCoordinate: addCoordinateToPlan,
    removeControlPoint: removeControlPointFromPlan,
    selectControlPoint,
  } = workspace;
  const [mapControlPointActionId, setMapControlPointActionId] = useState<string | null>(null);
  const [mapControlPointActionLoaded, setMapControlPointActionLoaded] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [deleteConfirmationLoaded, setDeleteConfirmationLoaded] = useState(false);
  const deleteCandidate = points.find((point) => point.id === deleteCandidateId);

  const addCoordinate = useCallback((coordinate: { latitude: number; longitude: number }) => {
    setMapControlPointActionId(null);
    void addCoordinateToPlan(coordinate);
  }, [addCoordinateToPlan]);

  const selectMapControlPoint = useCallback((id: string) => {
    setMapControlPointActionLoaded(true);
    setMapControlPointActionId(id);
    selectControlPoint(id);
  }, [selectControlPoint]);

  const selectAddressControlPoint = useCallback((id: string) => {
    setMapControlPointActionId(null);
    selectControlPoint(id);
  }, [selectControlPoint]);

  const requestControlPointRemoval = useCallback((id: string) => {
    setDeleteConfirmationLoaded(true);
    setDeleteCandidateId(id);
  }, []);

  const confirmControlPointRemoval = useCallback(() => {
    if (!deleteCandidateId) return;
    setMapControlPointActionId(null);
    removeControlPointFromPlan(deleteCandidateId);
    setDeleteCandidateId(null);
  }, [deleteCandidateId, removeControlPointFromPlan]);

  useEffect(() => {
    const removableControlPointId = workspace.pendingControlPointId
      ?? workspace.selectedControlPointId;
    if (!removableControlPointId || deleteCandidateId) return;
    const requestRemovalWithKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.isContentEditable
        || target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement;
      const deleteSelectedPoint = ["Delete", "Backspace"].includes(event.key);
      const cancelPendingPoint = event.key === "Escape" && workspace.pendingControlPointId;
      if (isEditing || (!deleteSelectedPoint && !cancelPendingPoint)) return;
      event.preventDefault();
      requestControlPointRemoval(removableControlPointId);
    };
    window.addEventListener("keydown", requestRemovalWithKeyboard);
    return () => window.removeEventListener("keydown", requestRemovalWithKeyboard);
  }, [
    deleteCandidateId,
    requestControlPointRemoval,
    workspace.pendingControlPointId,
    workspace.selectedControlPointId,
  ]);

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
        controlPointDeleteActionId={mapControlPointActionId}
        controlPointDeleteActionLoaded={mapControlPointActionLoaded}
        onDoubleClick={addCoordinate}
        onSelectControlPoint={selectMapControlPoint}
        onSelectRouteLeg={workspace.selectRouteLeg}
        onDismissControlPointDeleteAction={() => setMapControlPointActionId(null)}
        onRemoveControlPoint={requestControlPointRemoval}
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
        />
        <PlaceSearch
          disabled={workspace.mapStatus !== "ready"}
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
        ) : <div className="workspace-mode widget"><LayersIcon /><span>地图工作台</span></div>}
      </div>

      {workspace.catalogReady && !workspace.activePlan && workspace.catalog.length === 0 ? (
        <RoutePlanWelcomePanel
          onCreate={workspace.createPlan}
        />
      ) : null}

      {workspace.activePlan && points.length < 2 ? (
        <section className="workspace-guide widget" aria-live="polite">
          <span className="guide-step">{points.length + 1}</span>
          <span><strong>{points.length === 0 ? "添加环线起点" : "继续添加控制点"}</strong><small>{workspace.mapStatus === "ready" ? `搜索地点，或双击${workspace.mapProvider === "amap" ? "高德" : "腾讯"}地图选点` : workspace.mapMessage}</small></span>
        </section>
      ) : null}

      {workspace.mapStatus === "unavailable" ? (
        <section className="map-unavailable widget" role="status">
          <AlertIcon /><span><strong>{workspace.mapProvider === "amap" ? "高德" : "腾讯"}地图尚未启用</strong><small>{workspace.mapMessage}</small></span>
        </section>
      ) : null}

      {workspace.activePlan && points.length ? (
        <RouteAddressList
          provider={workspace.mapProvider}
          controlPoints={points}
          selectedControlPointId={workspace.selectedControlPointId}
          selectedRouteLegId={workspace.selectedRouteLegId}
          pendingControlPointId={workspace.pendingControlPointId}
          onSelectControlPoint={selectAddressControlPoint}
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
