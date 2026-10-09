"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowUpRight, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlaceCandidate, MapCoordinate } from "@roadbook/map/web";

import { WorkspaceTaskSheet, WorkspaceSheetPage } from "@/components/route-presentation/workspace-task-sheet";
import { ElevationPanel } from "@/components/elevation-analysis/elevation-panel";
import { FeaturedRouteModeBadge } from "@/components/featured-driving-route/featured-route-mode-badge";
import { MapProviderSwitch } from "@/components/map-provider/map-provider-switch";
import { GlobalSearch, type GlobalSearchHandle } from "@/components/map-search/global-search";
import { RoutePlanSelector } from "@/components/route-plan-catalog/route-plan-selector";
import { getRouteLegTravelMode } from "@/domain/route-planning/route-leg-travel-mode";
import { RouteMetricsPanel } from "@/components/route-metrics/route-metrics-panel";
import { RouteChargingEntry } from "@/components/route-charging/route-charging-entry";
import { RouteMap, type RouteElevationMapHandle } from "@/components/route-presentation/route-map";
import { RouteCalculationFeedback } from "@/components/route-planning/route-calculation-feedback";
import { AlertIcon, ChevronDownIcon, LayersIcon } from "@/components/ui/icons";
import { appToast } from "@/components/ui/toast-store";
import type { FeaturedDrivingRoute } from "@/domain/featured-driving-route/model";
import { formatPlanDisplayName, ROUTE_PLAN_CONTROL_POINT_LIMIT } from "@/domain/route-planning/model";
import { useFeaturedDrivingRouteAtlas } from "@/hooks/use-featured-driving-route-atlas";
import { useRoutePlanningWorkspace } from "@/hooks/use-route-planning-workspace";
import { useRouteCharging } from "@/hooks/use-route-charging";
import type { RouteChargingCandidate } from "@/domain/route-charging/model";
import { StaticFeaturedDrivingRouteRepository } from "@/infrastructure/featured-driving-route/static-featured-driving-route-repository";
import { createMapNavigationUri } from "@/lib/map-navigation/map-navigation-uri";
import type { WeatherForecastTarget } from "@/domain/weather-forecast/model";

const RouteAddressList = lazy(() => import("@/components/route-planning/route-address-list").then((module) => ({ default: module.RouteAddressList })));

const RouteLegDetail = lazy(() => import("@/components/route-planning/route-leg-detail").then((module) => ({ default: module.RouteLegDetail })));
const RouteStrategySelector = lazy(() => import("@/components/route-planning/route-strategy-selector").then((module) => ({ default: module.RouteStrategySelector })));

const FeaturedRoutePanel = lazy(() => import("@/components/featured-driving-route/featured-route-panel").then((module) => ({ default: module.FeaturedRoutePanel })));

const ControlPointDeleteConfirmation = lazy(() =>
  import("@/components/route-planning/control-point-delete-confirmation").then(
    (module) => ({ default: module.ControlPointDeleteConfirmation }),
  ),
);

const WeatherForecastCard = lazy(() =>
  import("@/components/weather-forecast/weather-forecast-card").then(
    (module) => ({ default: module.WeatherForecastCard }),
  ),
);

const featuredRouteRepository = new StaticFeaturedDrivingRouteRepository();
const RouteChargingPanel = lazy(() => import("@/components/route-charging/route-charging-panel").then((module) => ({ default: module.RouteChargingPanel })));

export function RoutePlanningWorkspace() {
  const workspace = useRoutePlanningWorkspace();
  useEffect(() => {
    if (workspace.draftStatus === "failed") {
      appToast.fail("本机暂存失败，最新编辑仍保留。请返回当前规划重试暂存后，再切换路线。");
    }
  }, [workspace.draftStatus]);
  const elevationMapRef = useRef<RouteElevationMapHandle>(null);
  const highlightElevation = useCallback((paths: MapCoordinate[][]) => elevationMapRef.current?.highlight(paths), []);
  const browseElevation = useCallback((coordinate: MapCoordinate | null) => elevationMapRef.current?.browse(coordinate), []);
  const focusElevation = useCallback((paths: MapCoordinate[][]) => elevationMapRef.current?.focus(paths), []);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchPreviewOpen, setSearchPreviewOpen] = useState(false);
  const [mapOcclusion, setMapOcclusion] = useState(0);
  const [business, setBusiness] = useState<"discovery" | "catalog" | "planning" | "guide">("discovery");
  const revealRoute = useCallback(() => setBusiness("planning"), []);
  const searchRef = useRef<GlobalSearchHandle>(null);
  const [insertionTarget, setInsertionTarget] = useState<{
    planId: string; fromId: string; toId: string; label: string;
  } | null>(null);
  const cancelInsertion = useCallback(() => setInsertionTarget(null), []);
  const featuredAtlas = useFeaturedDrivingRouteAtlas(workspace.adapter);
  const {
    activeRoute: activeFeaturedRoute,
    markers: featuredRouteMarkers,
    selectedControlPointId: featuredSelectedControlPointId,
    selectedMarkerId: featuredSelectedMarkerId,
    focusRequest: featuredFocusRequest,
    markerLimitReached,
    openRoute: openFeaturedRoute,
    closeRoute: closeFeaturedRoute,
    selectControlPoint: selectFeaturedControlPoint,
    selectMarker: selectFeaturedMarker,
    clearSelection: clearFeaturedSelection,
    addPlaceMarker,
    addCoordinateMarker,
    removeMarker: removeFeaturedMarker,
    clearMarkers: clearFeaturedMarkers,
  } = featuredAtlas;
  const featuredRoutes = useMemo(() => featuredRouteRepository.list(), []);
  const featuredCategories = useMemo(
    () => featuredRouteRepository.categories(),
    [],
  );
  const points = useMemo(
    () => workspace.activePlan?.controlPoints ?? [],
    [workspace.activePlan?.controlPoints],
  );
  const [weatherTargetId, setWeatherTargetId] = useState<string | null>(null);
  const weatherTarget = useMemo<WeatherForecastTarget | null>(() => {
    const point = points.find((item) => item.id === weatherTargetId);
    return point
      ? {
        id: point.id,
        name: point.name,
        latitude: point.latitude,
        longitude: point.longitude,
      }
      : null;
  }, [points, weatherTargetId]);
  const isFeaturedMode = Boolean(activeFeaturedRoute);
  const isWeatherForecastOpen = !isFeaturedMode && Boolean(weatherTarget);
  const controlPointLimitReached =
    points.length >= ROUTE_PLAN_CONTROL_POINT_LIMIT;
  const controlPointLimitMessage = `当前点位已满（${points.length}/${ROUTE_PLAN_CONTROL_POINT_LIMIT}），请先删除一个点位`;
  const searchDisabledReason = isFeaturedMode && markerLimitReached
    ? `我的标记已满（${featuredRouteMarkers.length}/20），请先删除一个标记`
    : !isFeaturedMode && controlPointLimitReached
      ? controlPointLimitMessage
    : workspace.mapStatus !== "ready"
      ? "地图服务连接后可搜索"
      : undefined;
  const searchPlaceholder =
    isFeaturedMode
      ? "搜索地点，添加到我的标记"
      : workspace.startPointStatus === "locating"
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
  const featuredRoads = useMemo(
    () => activeFeaturedRoute?.roads.map((road) => ({ ...road })) ?? [],
    [activeFeaturedRoute],
  );
  const featuredControlPoints = useMemo(
    () => activeFeaturedRoute?.controlPoints.map((point) => ({
      ...point,
      style: point.roadCode === "G219"
        ? "g219" as const
        : point.roadCode === "G331"
          ? "g331" as const
          : "g228" as const,
      selected: featuredSelectedControlPointId === point.id,
    })) ?? [],
    [activeFeaturedRoute, featuredSelectedControlPointId],
  );
  const featuredMarkers = useMemo(
    () => featuredRouteMarkers.map((marker) => ({
      ...marker,
      selected: featuredSelectedMarkerId === marker.id,
    })),
    [featuredRouteMarkers, featuredSelectedMarkerId],
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
      setWeatherTargetId(null);
      if (activeFeaturedRoute) {
        if (markerLimitReached) {
          appToast.info("我的标记已满，请先删除一个标记");
          return;
        }
        setBusiness("guide");
        void addCoordinateMarker(coordinate);
        appToast.info("已添加到我的标记，不会改变黄金大环线");
        return;
      }
      void addCoordinateToPlan(coordinate);
      revealRoute();
    },
    [
      addCoordinateToPlan,
      revealRoute,
      activeFeaturedRoute,
      addCoordinateMarker,
      markerLimitReached,
    ],
  );

  const selectSearchPlace = useCallback(
    (candidate: PlaceCandidate) => {
      setWeatherTargetId(null);
      if (activeFeaturedRoute) {
        setBusiness("guide");
        const markerId = addPlaceMarker(candidate);
        if (markerId) {
          appToast.info("已添加到我的标记，不会改变黄金大环线");
        }
        return;
      }
      if (insertionTarget) {
        if (!workspace.insertPlaceCandidate(insertionTarget, candidate)) {
          appToast.info("路线已变化或点位已满，请重新选择插入位置");
        }
        setInsertionTarget(null);
        revealRoute();
        return;
      }
      void workspace.addPlaceCandidate(candidate);
      revealRoute();
    },
    [activeFeaturedRoute, addPlaceMarker, insertionTarget, revealRoute, workspace],
  );

  const loadFeaturedRoute = useCallback(async (route: FeaturedDrivingRoute) => {
    const loadedRoute = await featuredRouteRepository.loadById(route.id);
    if (!loadedRoute) throw new Error("热门路线不存在或已下线");
    setWeatherTargetId(null);
    workspace.clearRouteLegSelection();
    openFeaturedRoute(loadedRoute);
    setBusiness("guide");
  }, [openFeaturedRoute, workspace]);

  const createPlan = useCallback(() => {
    const plan = workspace.createPlan();
    if (!plan) return null;
    setWeatherTargetId(null);
    closeFeaturedRoute();
    revealRoute();
    return plan;
  }, [closeFeaturedRoute, revealRoute, workspace]);

  const loadPlan = useCallback((id: string) => {
    const loaded = workspace.loadPlan(id);
    if (!loaded) return false;
    setWeatherTargetId(null);
    closeFeaturedRoute();
    if (loaded) revealRoute();
    return loaded;
  }, [closeFeaturedRoute, revealRoute, workspace]);

  const selectMapControlPoint = useCallback(
    (id: string) => {
      selectControlPoint(id);
      if (points.some((point) => point.id === id)) {
        setWeatherTargetId(id);
        revealRoute();
      }
    },
    [points, revealRoute, selectControlPoint],
  );

  const closeWeatherForecast = useCallback(() => {
    setWeatherTargetId(null);
  }, []);

  const clearMapContextSelection = useCallback(() => {
    setWeatherTargetId(null);
    if (activeFeaturedRoute) {
      clearFeaturedSelection();
      return;
    }
    clearRouteLegSelection();
  }, [activeFeaturedRoute, clearFeaturedSelection, clearRouteLegSelection]);

  const requestControlPointRemoval = useCallback((id: string) => {
    setDeleteConfirmationLoaded(true);
    setDeleteCandidateId(id);
  }, []);

  const confirmControlPointRemoval = useCallback(() => {
    if (!deleteCandidateId) return;
    removeControlPointFromPlan(deleteCandidateId);
    setWeatherTargetId((current) => current === deleteCandidateId ? null : current);
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
        (target instanceof HTMLInputElement && target.type !== "radio") ||
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

  const selectedLeg = workspace.route?.legs.find((leg) => leg.id === workspace.selectedRouteLegId);
  const [chargingEnabled, setChargingEnabled] = useState(false);
  const charging = useRouteCharging(workspace.route,
    `${workspace.activePlan?.id}:${workspace.mapProvider}:${workspace.route?.scope ?? "one-way"}`, workspace.routeContext?.sourceRevision ?? 0,
    chargingEnabled && !isFeaturedMode && points.length >= 2, workspace.routeStatus === "ready");
  const [chargingFocusRequest, setChargingFocusRequest] = useState<{ coordinate: MapCoordinate; sequence: number } | null>(null);
  const chargingMarkers = useMemo(() => charging.result?.stations.map((station) => ({
    id: station.id, name: station.name, ...station.coordinate, selected: station.id === charging.selectedStation?.id,
  })) ?? [], [charging.result, charging.selectedStation]);
  const selectedChargingStation = !weatherTarget && !selectedLeg ? charging.selectedStation : null;
  const selectChargingStation = (id: string | null) => {
    charging.selectStation(id);
    const station = charging.result?.stations.find((item) => item.id === id);
    if (station) {
      setWeatherTargetId(null);
      workspace.clearRouteLegSelection();
      setChargingFocusRequest((previous) => ({ coordinate: station.coordinate, sequence: (previous?.sequence ?? 0) + 1 }));
    }
    revealRoute();
  };
  const chargingAlreadyAdded = Boolean(selectedChargingStation && points.some((point) =>
    Math.abs(point.latitude - selectedChargingStation.coordinate.latitude) < 0.00001
    && Math.abs(point.longitude - selectedChargingStation.coordinate.longitude) < 0.00001));
  const chargingAddDisabledReason = chargingAlreadyAdded ? "该站点已在路线中"
    : controlPointLimitReached ? controlPointLimitMessage
    : !charging.current || workspace.routeStatus !== "ready" ? "等待沿途站点更新后再添加" : undefined;
  const addChargingStation = (station: RouteChargingCandidate) => {
    if (!workspace.activePlan || !workspace.routeContext || chargingAddDisabledReason) return;
    const inserted = workspace.insertPlaceCandidate({
      planId: workspace.activePlan.id, fromId: station.fromControlPointId, toId: station.toControlPointId,
      routeContext: workspace.routeContext,
    }, { id: station.id, name: station.name, address: station.address, coordinate: station.coordinate });
    if (inserted) { charging.selectStation(null); revealRoute(); appToast.info("已加入途经点，正在更新路线"); }
    else appToast.info("路线已变化，请等待沿途站点更新");
  };
  const chargingStatus = !chargingEnabled ? "点击图标，在地图上显示全程超充"
    : workspace.routeStatus !== "ready" ? "等待路线更新 · 图层保持开启"
    : charging.loading ? "正在更新全程超充…"
    : charging.error ? (charging.result ? "更新失败，保留上次站点" : "站点暂不可用")
    : charging.result?.stations.length === 0 ? "全程沿途 2 公里内暂无超充站"
    : `${charging.result?.stations.length ?? 0} 座超充 · 点击地图图标查看${charging.result?.stale ? " · 缓存目录" : ""}`;
  const dismissChargingStation = charging.selectStation;
  useEffect(() => {
    if (!selectedChargingStation) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable="true"], [role="dialog"]'))) return;
      dismissChargingStation(null);
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [selectedChargingStation, dismissChargingStation]);
  const selectedPlace = points.find((point) => point.id === weatherTargetId);
  const featuredPlace = activeFeaturedRoute?.controlPoints.find((point) => point.id === featuredSelectedControlPointId)
    ?? featuredRouteMarkers.find((point) => point.id === featuredSelectedMarkerId);
  const planningDetail = business === "planning" && Boolean(weatherTarget || selectedChargingStation || selectedLeg);
  const guideDetail = business === "guide" && Boolean(featuredPlace);
  const routeTitle = workspace.activePlan ? formatPlanDisplayName(workspace.catalog.find((plan) => plan.id === workspace.activePlan?.id) ?? workspace.activePlan) : "路线规划";
  const desktopCatalogOpen = business === "catalog" || (!workspace.activePlan && !isFeaturedMode);
  const desktopPanelPage = desktopCatalogOpen ? "catalog" : isFeaturedMode ? "guide" : weatherTarget ? "place" : selectedChargingStation ? "charging" : selectedLeg ? "leg" : "planning";
  const pageKey = searchOpen ? (searchPreviewOpen ? "search-preview" : "search") : planningDetail ? (weatherTarget ? `place:${weatherTarget.id}` : selectedChargingStation ? `charging:${selectedChargingStation.id}` : `leg:${selectedLeg?.id}`) : guideDetail ? `guide-place:${featuredPlace?.id}` : business;
  const title = business === "discovery" ? "" : business === "catalog" ? "我的路线" : business === "guide" ? (featuredPlace?.name ?? activeFeaturedRoute?.name ?? "路线指南") : weatherTarget?.name ?? selectedChargingStation?.name ?? (selectedLeg ? `路段 ${workspace.route!.legs.indexOf(selectedLeg) + 1}` : routeTitle);
  const returnToParent = () => {
    if (planningDetail) { setWeatherTargetId(null); charging.selectStation(null); workspace.clearRouteLegSelection(); }
    else if (guideDetail) clearFeaturedSelection();
    else setBusiness("discovery");
  };

  return (
    <main
      className={`planning-workspace${isWeatherForecastOpen ? " is-weather-forecast-open" : ""}`}
    >
      <RouteMap
        elevationHandle={elevationMapRef}
        providerControl={
          <MapProviderSwitch
            provider={workspace.mapProvider}
            loading={workspace.mapStatus === "loading"}
            onProviderChange={workspace.setMapProvider}
          />
        }
        mobileOcclusion={mapOcclusion}
        adapter={workspace.adapter}
        provider={workspace.mapProvider}
        controlPoints={isFeaturedMode ? [] : points}
        route={isFeaturedMode ? null : workspace.route}
        selectedControlPointId={isFeaturedMode ? null : workspace.selectedControlPointId}
        selectedRouteLegId={isFeaturedMode ? null : workspace.selectedRouteLegId}
        routeUpdating={!isFeaturedMode && workspace.routeStatus !== "ready"}
        focusControlPointRequest={isFeaturedMode ? null : workspace.mapFocusRequest}
        fitRoutePlanRequest={isFeaturedMode ? null : workspace.fitRoutePlanRequest}
        featuredRouteId={activeFeaturedRoute?.id ?? null}
        featuredRoads={featuredRoads}
        featuredControlPoints={featuredControlPoints}
        featuredMarkers={featuredMarkers}
        featuredFocusRequest={featuredFocusRequest}
        chargingStations={chargingMarkers}
        chargingFocusRequest={chargingFocusRequest}
        onSelectChargingStation={selectChargingStation}
        onDoubleClick={addCoordinate}
        onClearRouteLegSelection={() => { charging.selectStation(null); clearMapContextSelection(); }}
        onSelectControlPoint={(id) => { charging.selectStation(null); selectMapControlPoint(id); }}
        onSelectRouteLeg={(id) => { charging.selectStation(null); workspace.selectRouteLeg(id); setWeatherTargetId(null); revealRoute(); }}
        onSelectFeaturedControlPoint={(id) => { selectFeaturedControlPoint(id); setBusiness("guide"); }}
        onSelectFeaturedMarker={(id) => { selectFeaturedMarker(id); setBusiness("guide"); }}
        onInsertRouteLegControlPoint={workspace.insertRouteLegControlPoint}
      />


      {!isFeaturedMode && workspace.routeStatus === "updating" && points.length >= 2 ? (
        <RouteCalculationFeedback controlPointCount={points.length} onCancel={workspace.cancelRouteCalculation} />
      ) : null}

      {workspace.mapStatus === "unavailable" ? (
        <section data-glass="surface" className="map-unavailable widget" role="status">
          <AlertIcon />
          <span>
            <strong>
              {workspace.mapProvider === "amap" ? "高德" : "腾讯"}地图尚未启用
            </strong>
            <small>{workspace.mapMessage}</small>
          </span>
        </section>
      ) : null}

      <WorkspaceTaskSheet pageKey={pageKey} title={title} searchOpen={searchOpen}
        onBack={business === "discovery" ? undefined : returnToParent} onOcclusionChange={setMapOcclusion}>
        <div className="workspace-topbar">
          <WorkspaceSheetPage active={searchOpen || business === "discovery"}>
          <GlobalSearch
            ref={searchRef}
            onOpenChange={setSearchOpen}
            onPreviewChange={setSearchPreviewOpen}
            insertionLabel={insertionTarget?.label}
            onClose={cancelInsertion}
            placeholder={searchPlaceholder}
            placeSearchDisabled={Boolean(searchDisabledReason)}
            placeSearchDisabledReason={searchDisabledReason}
            featuredRoutes={insertionTarget ? [] : featuredRoutes}
            categories={featuredCategories}
            onSearchPlaces={workspace.searchPlaces}
            onSelectPlace={selectSearchPlace}
            onLoadFeaturedRoute={loadFeaturedRoute}
          />
          </WorkspaceSheetPage>
          <WorkspaceSheetPage active={!searchOpen && business === "planning" && !planningDetail}>
          {activeFeaturedRoute ? (
            <FeaturedRouteModeBadge
              routeName={activeFeaturedRoute.name}
              onExit={() => { closeFeaturedRoute(); setBusiness("discovery"); }}
            />
          ) : workspace.activePlan ? (
            <Suspense fallback={<div data-glass="desktop" className="strategy-selector widget workspace-section-loading workspace-mobile-only" role="status">正在加载…</div>}>
              <RouteStrategySelector
              strategy={workspace.activePlan.strategy}
              routeStatus={workspace.routeStatus}
              draftStatus={workspace.draftStatus}
              onRetrySave={workspace.retrySave}
              error={workspace.routeError}
              canUndo={workspace.canUndo}
              onStrategyChange={workspace.setStrategy}
              onUndo={workspace.undo}
            />
            </Suspense>
          ) : (
            <div data-glass="desktop" className="workspace-mode widget">
              <LayersIcon />
              <span>地图工作台</span>
            </div>
          )}
          </WorkspaceSheetPage>
        </div>

        <WorkspaceSheetPage active={!searchOpen && business === "discovery"} mobileOnly>
          <div className="workspace-discovery">
            <h2>你的路线</h2>
            <div className="workspace-discovery__actions">
              <button data-glass="inset" type="button" onClick={() => setBusiness("catalog")}><strong>我的路线</strong><small>{workspace.catalog.length} 条 · 保存在此设备</small></button>
              <button data-glass="inset" type="button" onClick={() => void createPlan()}><strong>＋ 新建规划</strong><small>从一个地点开始</small></button>
            </div>
            {workspace.activePlan ? <button type="button" data-glass="inset" className="workspace-discovery__resume" onClick={() => { closeFeaturedRoute(); revealRoute(); }}>继续编辑 · {routeTitle}<span>›</span></button> : null}
            {activeFeaturedRoute ? <button type="button" data-glass="inset" className="workspace-discovery__resume" onClick={() => setBusiness("guide")}>继续浏览 · {activeFeaturedRoute.name}<span>›</span></button> : null}
            <h2>路线指南</h2>
            <button type="button" data-glass="inset" className="workspace-discovery__resume" onClick={() => searchRef.current?.open()}>探索热门自驾路线<span>›</span></button>
          </div>
        </WorkspaceSheetPage>
        <div data-glass="desktop" className={`workspace-route-panels${!isFeaturedMode && selectedChargingStation ? " is-charging" : ""}`} data-view={desktopPanelPage}>
          <WorkspaceSheetPage active={!searchOpen && business === "catalog"} desktopActive>
          <RoutePlanSelector
            catalog={workspace.catalog}
            catalogReady={workspace.catalogReady}
            activePlan={workspace.activePlan}
            open={desktopCatalogOpen}
            onOpenChange={(open) => setBusiness(open ? "catalog" : isFeaturedMode ? "guide" : "planning")}
            contextLabel={activeFeaturedRoute?.name}
            resumeLabel={isFeaturedMode ? "返回路线指南" : workspace.activePlan ? "返回当前规划" : undefined}
            onCreate={createPlan}
            onLoad={loadPlan}
            onRename={workspace.renamePlan}
            onDelete={workspace.deletePlan}
            onClearAll={workspace.clearPlans}
          />
          </WorkspaceSheetPage>
        <WorkspaceSheetPage active={!searchOpen && planningDetail && Boolean(weatherTarget)} desktopActive={desktopPanelPage === "place"}>
          {selectedPlace ? <div className="workspace-place-detail">
            <button type="button" className="workspace-place-detail__back" onClick={closeWeatherForecast}>
              <ChevronDownIcon />返回当前路线规划
            </button>
            <p>{selectedPlace.address}</p>
            <div className="workspace-place-detail__actions">
              <Button asChild>
                <a href={createMapNavigationUri({ provider: workspace.mapProvider, to: selectedPlace })}>
                  <ArrowUpRight size={16} aria-hidden="true" />导航到这里
                </a>
              </Button>
              <Button type="button" variant="ghost" className="workspace-place-detail__remove"
                onClick={() => requestControlPointRemoval(selectedPlace.id)}>
                <Trash2 size={16} aria-hidden="true" />删除途经点
              </Button>
            </div>
          </div> : null}
        <div className="workspace-weather-slot">
          {!isFeaturedMode && weatherTarget ? (
            <Suspense
              fallback={(
                <div data-glass="desktop" className="workspace-weather-loading" role="status">
                  正在加载天气卡片…
                </div>
              )}
            >
              <WeatherForecastCard
                key={weatherTarget.id}
                target={weatherTarget}
                onClose={closeWeatherForecast}
              />
            </Suspense>
          ) : null}

        </div>
        </WorkspaceSheetPage>

        <WorkspaceSheetPage active={!searchOpen && business === "planning" && Boolean(selectedChargingStation)} desktopActive={desktopPanelPage === "charging"}>
        {!isFeaturedMode && selectedChargingStation ? (
          <Suspense fallback={<section className="route-charging-loading" role="status">正在加载充电站详情…</section>}>
            <RouteChargingPanel
              station={selectedChargingStation} provider={workspace.mapProvider}
              stale={!charging.current || Boolean(charging.result?.stale)}
              addDisabledReason={chargingAddDisabledReason}
              onAdd={addChargingStation} onClose={() => charging.selectStation(null)}
            />
          </Suspense>
        ) : null}
        </WorkspaceSheetPage>
        <WorkspaceSheetPage active={!searchOpen && business === "planning" && !planningDetail} desktopActive={desktopPanelPage === "planning"}>
        {!isFeaturedMode && workspace.activePlan ? (
          <Suspense fallback={<div data-glass="desktop" className={`address-list widget workspace-section-loading${points.length === 0 ? " is-empty" : ""}`} style={{ height: points.length * 112 + 96 }} role="status">正在加载…</div>}>
            <RouteAddressList
              routeActions={points.length >= 2 ? <RouteChargingEntry
                disabled={!chargingEnabled && (workspace.routeStatus !== "ready" || !workspace.route?.legs.length)}
                enabled={chargingEnabled} status={chargingStatus} error={Boolean(charging.error)} onRetry={charging.retry}
                onToggle={() => { setChargingEnabled(!chargingEnabled); charging.selectStation(null); }}
              /> : null}
              strategyControl={(
                <Suspense fallback={<span className="address-list__strategy-loading">路线策略…</span>}>
                  <RouteStrategySelector
                    compact
                    strategy={workspace.activePlan.strategy}
                    routeStatus={workspace.routeStatus}
                    draftStatus={workspace.draftStatus}
                    onRetrySave={workspace.retrySave}
                    error={workspace.routeError}
                    canUndo={workspace.canUndo}
                    onStrategyChange={workspace.setStrategy}
                    onUndo={workspace.undo}
                  />
                </Suspense>
              )}
              provider={workspace.mapProvider}
              controlPoints={points}
              includeReturn={workspace.route?.scope === "round-trip"}
              legTravelModes={workspace.activePlan?.legTravelModes}
              selectedControlPointId={workspace.selectedControlPointId}
              selectedRouteLegId={workspace.selectedRouteLegId}
              pendingControlPointId={workspace.pendingControlPointId}
              onSelectControlPoint={(id) => {
                if (window.matchMedia("(max-width: 760px)").matches) {
                  selectControlPoint(id);
                  setWeatherTargetId(null);
                } else {
                  selectMapControlPoint(id);
                }
              }}
              onShowWeather={selectMapControlPoint}
              onSelectRouteLeg={(id) => { charging.selectStation(null); workspace.selectRouteLeg(id); setWeatherTargetId(null); }}
              addWaypointDisabledReason={searchDisabledReason}
              onAppendWaypoint={() => searchRef.current?.open()}
              onAddWaypoint={(fromId, toId) => {
                if (!workspace.activePlan || searchDisabledReason) return;
                const from = points.find((point) => point.id === fromId);
                const to = points.find((point) => point.id === toId);
                if (!from || !to) return;
                setWeatherTargetId(null);
                setInsertionTarget({
                  planId: workspace.activePlan.id, fromId, toId,
                  label: `正在添加途经点：${from.name} → ${to.name}`,
                });
                searchRef.current?.open();
              }}
              onReorder={workspace.reorderControlPoint}
              onRemove={requestControlPointRemoval}
            />
          </Suspense>
        ) : null}

          <button type="button" className="workspace-add-place workspace-mobile-only" onClick={() => searchRef.current?.open()} disabled={Boolean(searchDisabledReason)}>＋ 添加途经点</button>
        </WorkspaceSheetPage>
        <WorkspaceSheetPage active={!searchOpen && business === "planning" && !weatherTarget} desktopActive={desktopPanelPage === "planning" || desktopPanelPage === "leg"}>
        {selectedLeg && workspace.activePlan ? (
          <Suspense fallback={<div className="workspace-leg-detail route-leg-loading" role="status">正在加载路段…</div>}>
            <RouteLegDetail
              index={workspace.route!.legs.indexOf(selectedLeg)}
              from={points.find((point) => point.id === selectedLeg.fromControlPointId)!}
              to={points.find((point) => point.id === selectedLeg.toControlPointId)!}
              mode={getRouteLegTravelMode(workspace.activePlan, selectedLeg.id)}
              provider={workspace.mapProvider} status={workspace.routeStatus}
              error={workspace.routeError} onRetry={workspace.retryRouteCalculation} onBack={returnToParent}
              onModeChange={(mode) => workspace.setRouteLegTravelMode(selectedLeg.id, mode)}
            />
          </Suspense>
        ) : null}
        {!isFeaturedMode && points.length >= 2 && !workspace.route ? (
          <aside data-glass="desktop" className="route-metrics widget workspace-metrics-loading" aria-label="路线摘要" role="status">
            <div className="workspace-metrics-loading__header">
              <strong>{workspace.routeStatus === "cancelled" ? "已取消路线生成" : workspace.routeStatus === "failed" ? "路线暂不可用" : "正在计算路线"}</strong>
              {workspace.routeStatus === "cancelled" ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="workspace-metrics-loading__retry"
                  onClick={workspace.retryRouteCalculation}
                  disabled={workspace.mapStatus !== "ready" || !workspace.adapter}
                  title={workspace.mapStatus !== "ready" ? "地图服务连接后可再次生成" : "按当前控制点和策略再次生成"}
                >
                  <RotateCw size={16} aria-hidden="true" />
                  再次生成
                </Button>
              ) : null}
            </div>
            <span>{workspace.routeStatus === "cancelled" ? "控制点已保留，可点击再次生成。" : workspace.routeStatus === "failed" ? "可继续调整途经点，或切换路线策略重试。" : "预计里程与用时将在这里显示"}</span>
          </aside>
        ) : null}
        {!isFeaturedMode && workspace.route ? (
          <RouteMetricsPanel
            route={workspace.route}
            provider={workspace.mapProvider}
            controlPoints={points}
            selectedRouteLegId={workspace.selectedRouteLegId}
            includeReturn={workspace.includeReturn}
            returnRouteLoading={workspace.returnRouteLoading}
            returnRouteError={workspace.returnRouteError}
            stale={workspace.routeStatus !== "ready"}
            onToggleReturn={() => { cancelInsertion(); workspace.toggleReturnRoute(); }}
          />
        ) : null}

        {!isFeaturedMode && workspace.activePlan && points.length === 0 ? (
          <p className="workspace-route-empty">搜索地点，添加路线起点。</p>
        ) : null}
        </WorkspaceSheetPage>
        <WorkspaceSheetPage active={!searchOpen && business === "guide" && !guideDetail} desktopActive={desktopPanelPage === "guide"}>
          <button type="button" className="workspace-add-place workspace-mobile-only" onClick={() => searchRef.current?.open()} disabled={Boolean(searchDisabledReason)}>＋ 添加我的标记</button>
        {activeFeaturedRoute ? (
          <Suspense fallback={<div data-glass="desktop" className="featured-route-panel widget workspace-section-loading" role="status">正在加载…</div>}>
            <FeaturedRoutePanel
              provider={workspace.mapProvider}
              route={activeFeaturedRoute}
              markers={featuredRouteMarkers}
              selectedControlPointId={featuredSelectedControlPointId}
              selectedMarkerId={featuredSelectedMarkerId}
              onSelectControlPoint={selectFeaturedControlPoint}
              onSelectMarker={selectFeaturedMarker}
              onRemoveMarker={removeFeaturedMarker}
              onClearMarkers={clearFeaturedMarkers}
              onExit={() => { closeFeaturedRoute(); setBusiness("discovery"); }}
            />
          </Suspense>
        ) : null}

        </WorkspaceSheetPage>
        </div>
        <WorkspaceSheetPage active={!searchOpen && guideDetail} mobileOnly>
          {featuredPlace ? <div className="workspace-place-detail">
            <p>{"region" in featuredPlace ? featuredPlace.region : featuredPlace.address}</p>
            <a href={createMapNavigationUri({ provider: workspace.mapProvider, to: featuredPlace })}>导航到这里</a>
            {"roadCode" in featuredPlace ? <p>{featuredPlace.roadCode} · 官方沿线地点</p> : <button type="button" onClick={() => { removeFeaturedMarker(featuredPlace.id); clearFeaturedSelection(); }}>删除我的标记</button>}
          </div> : null}
        </WorkspaceSheetPage>
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

      </WorkspaceTaskSheet>
      {!isFeaturedMode ? <ElevationPanel
        route={workspace.routeStatus === "ready" ? workspace.route : null}
        points={points}
        planId={workspace.activePlan?.id ?? null}
        revision={workspace.routeContext?.sourceRevision ?? 0}
        mapProvider={workspace.mapProvider}
        updating={workspace.routeStatus === "updating"}
        selectedLegId={workspace.selectedRouteLegId}
        onHighlight={highlightElevation}
        onBrowse={browseElevation}
        onFocus={focusElevation}
      /> : null}
    </main>
  );
}
