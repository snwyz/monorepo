"use client";

import type { WebMapProvider } from "@roadbook/map/web";
import { useState } from "react";

import {
  ChevronDownIcon,
  CloseIcon,
  NavigationIcon,
  RouteIcon,
  TrashIcon,
} from "@/components/ui/icons";
import {
  FEATURED_ROUTE_MARKER_LIMIT,
  type FeaturedDrivingRoute,
  type FeaturedRouteControlPointKind,
  type FeaturedRouteUserMarker,
} from "@/domain/featured-driving-route/model";
import { createMapNavigationUri } from "@/lib/map-navigation/map-navigation-uri";

interface FeaturedRoutePanelProps {
  provider: WebMapProvider;
  route: FeaturedDrivingRoute;
  markers: FeaturedRouteUserMarker[];
  selectedControlPointId: string | null;
  selectedMarkerId: string | null;
  onSelectControlPoint: (id: string) => void;
  onSelectMarker: (id: string) => void;
  onRemoveMarker: (id: string) => void;
  onClearMarkers: () => void;
  onExit: () => void;
}

const roadLabels = {
  G331: "北部边境",
  G219: "西部边境",
  G228: "东部海岸",
} as const;

const controlPointKindLabels: Record<FeaturedRouteControlPointKind, string> = {
  "county-city": "县市",
  port: "口岸",
  scenic: "景区",
};

export function FeaturedRoutePanel({
  provider,
  route,
  markers,
  selectedControlPointId,
  selectedMarkerId,
  onSelectControlPoint,
  onSelectMarker,
  onRemoveMarker,
  onClearMarkers,
  onExit,
}: FeaturedRoutePanelProps) {
  const [collapsed, setCollapsed] = useState(() => (
    typeof window !== "undefined"
      && window.matchMedia("(max-width: 760px)").matches
  ));

  return (
    <aside className={`featured-route-panel widget${collapsed ? " is-collapsed" : ""}`} aria-label={`${route.name}专题`}>
      <header className="featured-route-panel__header">
        <button
          type="button"
          className="featured-route-panel__toggle"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <span className="featured-route-panel__icon"><RouteIcon /></span>
          <span><small>{route.eyebrow}</small><strong>{route.name}</strong></span>
          <ChevronDownIcon className={collapsed ? undefined : "is-rotated"} />
        </button>
        <button type="button" className="featured-route-panel__exit" onClick={onExit} aria-label="退出热门路线专题">
          <CloseIcon />
        </button>
      </header>

      <div className="featured-route-panel__body">
        <p className="featured-route-panel__description">{route.description}</p>
        <div className="featured-route-legend" aria-label="国道图例">
          {route.roadCodes.map((code) => (
            <span key={code} className={`is-${code.toLowerCase()}`}>
              <i />
              <strong>{code}</strong>
              <small>{roadLabels[code]}</small>
            </span>
          ))}
        </div>

        <section className="featured-route-panel__section">
          <header><h2>沿线控制点</h2><span>{route.controlPoints.length}</span></header>
          <div className="featured-route-place-list">
            {route.roadCodes.map((roadCode) => {
              const controlPoints = route.controlPoints.filter(
                (point) => point.roadCode === roadCode,
              );
              return (
                <section key={roadCode} className="featured-route-control-group">
                  <h3><strong>{roadCode}</strong><span>{controlPoints.length} 个控制点</span></h3>
                  {controlPoints.map((point) => (
                    <div key={point.id} className={`featured-route-place${selectedControlPointId === point.id ? " is-selected" : ""}`}>
                      <button type="button" onClick={() => onSelectControlPoint(point.id)}>
                        <span className={`featured-route-place__dot is-${point.roadCode.toLowerCase()}`} />
                        <span>
                          <strong>{point.name}</strong>
                          <small>{point.region} · {controlPointKindLabels[point.kind]}</small>
                        </span>
                      </button>
                      <a
                        href={createMapNavigationUri({ provider, to: point })}
                        aria-label={`导航到${point.name}`}
                        title={`使用${provider === "amap" ? "高德" : "腾讯"}地图导航到${point.name}`}
                        onClick={() => onSelectControlPoint(point.id)}
                      >
                        <NavigationIcon />
                      </a>
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
        </section>

        <section className="featured-route-panel__section featured-route-markers">
          <header>
            <h2>我的标记</h2>
            <span>{markers.length}/{FEATURED_ROUTE_MARKER_LIMIT}</span>
            {markers.length ? <button type="button" onClick={onClearMarkers}>清空</button> : null}
          </header>
          {markers.length ? (
            <div className="featured-route-place-list">
              {markers.map((marker) => (
                <div key={marker.id} className={`featured-route-place is-user-marker${selectedMarkerId === marker.id ? " is-selected" : ""}`}>
                  <button type="button" onClick={() => onSelectMarker(marker.id)}>
                    <span className="featured-route-place__dot" />
                    <span><strong>{marker.name}</strong><small>{marker.address}</small></span>
                  </button>
                  <a
                    href={createMapNavigationUri({ provider, to: marker })}
                    aria-label={`导航到${marker.name}`}
                    onClick={() => onSelectMarker(marker.id)}
                  >
                    <NavigationIcon />
                  </a>
                  <button
                    type="button"
                    className="featured-route-place__remove"
                    aria-label={`删除标记${marker.name}`}
                    onClick={() => onRemoveMarker(marker.id)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="featured-route-markers__empty">搜索地点或双击地图，即可添加个人标记。</p>
          )}
        </section>

        <footer>{route.dataNotice}</footer>
      </div>
    </aside>
  );
}
