"use client";

import type { ClosedDrivingRoute, WebMapProvider } from "@roadbook/map/web";

import { ClockIcon, DistanceIcon, ExternalIcon, TrafficIcon } from "@/components/ui/icons";
import type { ControlPoint } from "@/domain/route-planning/model";
import { createMapNavigationUri } from "@/lib/map-navigation/map-navigation-uri";

interface RouteMetricsPanelProps {
  route: ClosedDrivingRoute;
  provider: WebMapProvider;
  controlPoints: ControlPoint[];
  selectedRouteLegId: string | null;
}

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(meters >= 100_000 ? 0 : 1)} km` : `${Math.round(meters)} m`;
}

function formatDuration(minutes: number) {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return hours ? `${hours} 小时 ${rest} 分` : `${rest} 分钟`;
}

export function RouteMetricsPanel({
  route,
  provider,
  controlPoints,
  selectedRouteLegId,
}: RouteMetricsPanelProps) {
  const selectedLeg = route.legs.find((leg) => leg.id === selectedRouteLegId) ?? null;
  const distance = selectedLeg?.distanceMeters ?? route.distanceMeters;
  const duration = selectedLeg?.durationMinutes ?? route.durationMinutes;
  const lights = selectedLeg?.trafficLightCount ?? route.trafficLightCount;
  const from = selectedLeg ? controlPoints.find((point) => point.id === selectedLeg.fromControlPointId) : null;
  const to = selectedLeg ? controlPoints.find((point) => point.id === selectedLeg.toControlPointId) : null;

  return (
    <aside className="route-metrics widget" aria-label="路线摘要">
      <header className="widget-title">
        <div><small>{selectedLeg ? "当前路段" : "完整环线"}</small><h2>{selectedLeg ? `路段 ${route.legs.indexOf(selectedLeg) + 1}` : `${controlPoints.length} 个控制点`}</h2></div>
        <span className="status-dot">路线有效</span>
      </header>
      <div className="metric-grid">
        <div><DistanceIcon /><span><small>预计里程</small><strong>{formatDistance(distance)}</strong></span></div>
        <div><ClockIcon /><span><small>预计驾驶</small><strong>{formatDuration(duration)}</strong></span></div>
        <div><TrafficIcon /><span><small>红绿灯</small><strong>{lights === null ? "暂无数据" : `${lights} 个`}</strong></span></div>
      </div>
      {from && to ? (
        <a className="external-navigation" href={createMapNavigationUri({ provider, from, to })} target="_blank" rel="noreferrer">
          <span><small>外部导航</small><strong>{from.name} → {to.name}</strong></span><ExternalIcon />
        </a>
      ) : <p className="metrics-hint">选择右侧连接线，可查看路段数据并在当前地图中打开。</p>}
      <footer>数据来自{provider === "amap" ? "高德" : "腾讯"}地图 · 预计值仅供参考</footer>
    </aside>
  );
}
