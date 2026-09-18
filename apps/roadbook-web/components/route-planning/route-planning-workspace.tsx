"use client";

import { useCallback } from "react";

import { ElevationPanel } from "@/components/elevation-analysis/elevation-panel";
import { RoutePlanSelector } from "@/components/route-plan-catalog/route-plan-selector";
import { RoutePlanWelcomePanel } from "@/components/route-plan-catalog/route-plan-welcome-panel";
import { RouteMetricsPanel } from "@/components/route-metrics/route-metrics-panel";
import { TencentRouteMap } from "@/components/route-presentation/tencent-route-map";
import { PlaceSearch } from "@/components/route-planning/place-search";
import { RouteAddressList } from "@/components/route-planning/route-address-list";
import { RouteStrategySelector } from "@/components/route-planning/route-strategy-selector";
import { AlertIcon, LayersIcon } from "@/components/ui/icons";
import { useRoutePlanningWorkspace } from "@/hooks/use-route-planning-workspace";

export function RoutePlanningWorkspace() {
  const workspace = useRoutePlanningWorkspace();
  const points = workspace.activePlan?.controlPoints ?? [];
  const { addCoordinate: addCoordinateToPlan } = workspace;

  const addCoordinate = useCallback((coordinate: { latitude: number; longitude: number }) => {
    void addCoordinateToPlan(coordinate);
  }, [addCoordinateToPlan]);

  return (
    <main className="planning-workspace">
      <TencentRouteMap
        adapter={workspace.adapter}
        controlPoints={points}
        route={workspace.route}
        selectedControlPointId={workspace.selectedControlPointId}
        selectedRouteLegId={workspace.selectedRouteLegId}
        routeUpdating={workspace.routeStatus === "updating"}
        onDoubleClick={addCoordinate}
        onSelectControlPoint={workspace.selectControlPoint}
        onSelectRouteLeg={workspace.selectRouteLeg}
      />

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

      {workspace.catalogReady && !workspace.activePlan ? (
        <RoutePlanWelcomePanel
          catalog={workspace.catalog}
          onCreate={workspace.createPlan}
          onLoad={workspace.loadPlan}
        />
      ) : null}

      {workspace.activePlan && points.length < 2 ? (
        <section className="workspace-guide widget" aria-live="polite">
          <span className="guide-step">{points.length + 1}</span>
          <span><strong>{points.length === 0 ? "添加环线起点" : "继续添加控制点"}</strong><small>{workspace.mapStatus === "ready" ? "搜索地点，或双击腾讯地图选点" : workspace.mapMessage}</small></span>
        </section>
      ) : null}

      {workspace.mapStatus === "unavailable" ? (
        <section className="map-unavailable widget" role="status">
          <AlertIcon /><span><strong>腾讯地图尚未启用</strong><small>{workspace.mapMessage}</small></span>
        </section>
      ) : null}

      {workspace.activePlan && points.length ? (
        <RouteAddressList
          controlPoints={points}
          selectedControlPointId={workspace.selectedControlPointId}
          selectedRouteLegId={workspace.selectedRouteLegId}
          pendingControlPointId={workspace.pendingControlPointId}
          onSelectControlPoint={workspace.selectControlPoint}
          onSelectRouteLeg={workspace.selectRouteLeg}
          onMove={workspace.moveControlPoint}
          onRemove={workspace.removeControlPoint}
          onSetAsStart={workspace.setAsStart}
        />
      ) : null}

      {workspace.route ? (
        <RouteMetricsPanel
          route={workspace.route}
          controlPoints={points}
          selectedRouteLegId={workspace.selectedRouteLegId}
        />
      ) : null}

      <ElevationPanel hasRoute={Boolean(workspace.route)} />
    </main>
  );
}
