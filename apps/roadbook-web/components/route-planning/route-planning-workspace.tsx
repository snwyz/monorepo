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
import type { PlaceCandidate } from "@roadbook/map/web";

import { WorkspaceTaskSheet, WorkspaceSheetPage } from "@/components/route-presentation/workspace-task-sheet";
import { ElevationPanel } from "@/components/elevation-analysis/elevation-panel";
import { FeaturedRouteModeBadge } from "@/components/featured-driving-route/featured-route-mode-badge";
import { MapProviderSwitch } from "@/components/map-provider/map-provider-switch";
import { GlobalSearch, type GlobalSearchHandle } from "@/components/map-search/global-search";
import { RoutePlanSelector } from "@/components/route-plan-catalog/route-plan-selector";
import { RoutePlanWelcomePanel } from "@/components/route-plan-catalog/route-plan-welcome-panel";
import { RouteMetricsPanel } from "@/components/route-metrics/route-metrics-panel";
import { RouteMap } from "@/components/route-presentation/route-map";
import { RouteCalculationFeedback } from "@/components/route-planning/route-calculation-feedback";
import { AlertIcon, LayersIcon } from "@/components/ui/icons";
import { appToast } from "@/components/ui/toast-store";
import type { FeaturedDrivingRoute } from "@/domain/featured-driving-route/model";
import { formatPlanDisplayName, ROUTE_PLAN_CONTROL_POINT_LIMIT } from "@/domain/route-planning/model";
import { useFeaturedDrivingRouteAtlas } from "@/hooks/use-featured-driving-route-atlas";
import { useRoutePlanningWorkspace } from "@/hooks/use-route-planning-workspace";
import { StaticFeaturedDrivingRouteRepository } from "@/infrastructure/featured-driving-route/static-featured-driving-route-repository";
import { createMapNavigationUri } from "@/lib/map-navigation/map-navigation-uri";
import type { WeatherForecastTarget } from "@/domain/weather-forecast/model";

const RouteAddressList = lazy(() => import("@/components/route-planning/route-address-list").then((module) => ({ default: module.RouteAddressList })));

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

export function RoutePlanningWorkspace() {
  const workspace = useRoutePlanningWorkspace();
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
    setWeatherTargetId(null);
    closeFeaturedRoute();
    revealRoute();
    return workspace.createPlan();
  }, [closeFeaturedRoute, revealRoute, workspace]);

  const loadPlan = useCallback((id: string) => {
    setWeatherTargetId(null);
    closeFeaturedRoute();
    const loaded = workspace.loadPlan(id);
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

  const selectedLeg = workspace.route?.legs.find((leg) => leg.id === workspace.selectedRouteLegId);
  const selectedPlace = points.find((point) => point.id === weatherTargetId);
  const featuredPlace = activeFeaturedRoute?.controlPoints.find((point) => point.id === featuredSelectedControlPointId)
    ?? featuredRouteMarkers.find((point) => point.id === featuredSelectedMarkerId);
  const planningDetail = business === "planning" && Boolean(weatherTarget || selectedLeg);
  const guideDetail = business === "guide" && Boolean(featuredPlace);
  const routeTitle = workspace.activePlan ? formatPlanDisplayName(workspace.catalog.find((plan) => plan.id === workspace.activePlan?.id) ?? workspace.activePlan) : "路线规划";
  const pageKey = searchOpen ? (searchPreviewOpen ? "search-preview" : "search") : planningDetail ? (weatherTarget ? `place:${weatherTarget.id}` : `leg:${selectedLeg?.id}`) : guideDetail ? `guide-place:${featuredPlace?.id}` : business;
  const title = business === "discovery" ? "" : business === "catalog" ? "我的路线" : business === "guide" ? (featuredPlace?.name ?? activeFeaturedRoute?.name ?? "路线指南") : weatherTarget?.name ?? (selectedLeg ? `路段 ${workspace.route!.legs.indexOf(selectedLeg) + 1}` : routeTitle);
  const returnToParent = () => {
    if (planningDetail) { setWeatherTargetId(null); workspace.clearRouteLegSelection(); }
    else if (guideDetail) clearFeaturedSelection();
    else setBusiness("discovery");
  };

  return (
    <main
      className={`planning-workspace${isWeatherForecastOpen ? " is-weather-forecast-open" : ""}`}
    >
      <RouteMap
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
        routeUpdating={!isFeaturedMode && workspace.routeStatus === "updating"}
        focusControlPointRequest={isFeaturedMode ? null : workspace.mapFocusRequest}
        fitRoutePlanRequest={isFeaturedMode ? null : workspace.fitRoutePlanRequest}
        featuredRouteId={activeFeaturedRoute?.id ?? null}
        featuredRoads={featuredRoads}
        featuredControlPoints={featuredControlPoints}
        featuredMarkers={featuredMarkers}
        featuredFocusRequest={featuredFocusRequest}
        onDoubleClick={addCoordinate}
        onClearRouteLegSelection={clearMapContextSelection}
        onSelectControlPoint={selectMapControlPoint}
        onSelectRouteLeg={(id) => { workspace.selectRouteLeg(id); setWeatherTargetId(null); revealRoute(); }}
        onSelectFeaturedControlPoint={(id) => { selectFeaturedControlPoint(id); setBusiness("guide"); }}
        onSelectFeaturedMarker={(id) => { selectFeaturedMarker(id); setBusiness("guide"); }}
        onInsertRouteLegControlPoint={workspace.insertRouteLegControlPoint}
      />


      {!isFeaturedMode && workspace.routeStatus === "updating" && points.length >= 2 ? (
        <RouteCalculationFeedback controlPointCount={points.length} />
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
        <WorkspaceSheetPage active={!searchOpen && planningDetail && Boolean(weatherTarget)}>
          {selectedPlace ? <div className="workspace-place-detail workspace-mobile-only">
            <p>{selectedPlace.address}</p>
            <a href={createMapNavigationUri({ provider: workspace.mapProvider, to: selectedPlace })}>导航到这里</a>
            <button type="button" onClick={() => requestControlPointRemoval(selectedPlace.id)}>删除途经点</button>
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
        <div className="workspace-topbar">
          <WorkspaceSheetPage active={!searchOpen && business === "catalog"}>
          <RoutePlanSelector
            catalog={workspace.catalog}
            activePlan={workspace.activePlan}
            onCreate={createPlan}
            onLoad={loadPlan}
            onRename={workspace.renamePlan}
            onDelete={workspace.deletePlan}
            onClearAll={workspace.clearPlans}
          />
          </WorkspaceSheetPage>
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
            <Suspense fallback={<div data-glass="desktop" className="strategy-selector widget workspace-section-loading" role="status">正在加载…</div>}>
              <RouteStrategySelector
              strategy={workspace.activePlan.strategy}
              routeStatus={workspace.routeStatus}
              draftStatus={workspace.draftStatus}
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

        <WorkspaceSheetPage active={false}>
        {workspace.catalogReady &&
        !isFeaturedMode &&
        !workspace.activePlan &&
        workspace.catalog.length === 0 ? (
          <RoutePlanWelcomePanel onCreate={workspace.createPlan} />
        ) : null}

        </WorkspaceSheetPage>
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
        <WorkspaceSheetPage active={!searchOpen && business === "planning" && !planningDetail}>
        {!isFeaturedMode && workspace.activePlan && points.length ? (
          <Suspense fallback={<div data-glass="desktop" className="address-list widget workspace-section-loading" style={{ minHeight: points.length * 112 + 96 }} role="status">正在加载…</div>}>
            <RouteAddressList
              provider={workspace.mapProvider}
              controlPoints={points}
              selectedControlPointId={workspace.selectedControlPointId}
              selectedRouteLegId={workspace.selectedRouteLegId}
              pendingControlPointId={workspace.pendingControlPointId}
              onSelectControlPoint={selectMapControlPoint}
              onSelectRouteLeg={(id) => { workspace.selectRouteLeg(id); setWeatherTargetId(null); }}
              addWaypointDisabledReason={searchDisabledReason}
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
        <WorkspaceSheetPage active={!searchOpen && business === "guide" && !guideDetail}>
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

        <WorkspaceSheetPage active={!searchOpen && business === "planning" && !weatherTarget}>
        {selectedLeg ? <div className="workspace-leg-detail workspace-mobile-only"><p>{points.find((point) => point.id === selectedLeg.fromControlPointId)?.name} → {points.find((point) => point.id === selectedLeg.toControlPointId)?.name}</p></div> : null}
        {!isFeaturedMode && points.length >= 2 && !workspace.route ? (
          <aside data-glass="desktop" className="route-metrics widget workspace-metrics-loading" aria-label="路线摘要" role="status">
            <strong>{workspace.routeStatus === "failed" ? "路线暂不可用" : "正在计算路线"}</strong>
            <span>{workspace.routeStatus === "failed" ? "可继续调整途经点，或切换路线策略重试。" : "预计里程与用时将在这里显示"}</span>
          </aside>
        ) : null}
        {!isFeaturedMode && workspace.route ? (
          <RouteMetricsPanel
            route={workspace.route}
            provider={workspace.mapProvider}
            controlPoints={points}
            selectedRouteLegId={workspace.selectedRouteLegId}
          />
        ) : null}

        {!isFeaturedMode && workspace.activePlan && points.length === 0 ? (
          <p className="workspace-route-empty">搜索地点或双击地图，添加路线起点。</p>
        ) : null}
        </WorkspaceSheetPage>
      </WorkspaceTaskSheet>
      {!isFeaturedMode ? <ElevationPanel hasRoute={Boolean(workspace.route)} /> : null}
    </main>
  );
}
