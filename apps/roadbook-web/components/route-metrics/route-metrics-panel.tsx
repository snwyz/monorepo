"use client";

import type { ClosedDrivingRoute, WebMapProvider } from "@roadbook/map/web";

import { ClockIcon, DistanceIcon } from "@/components/ui/icons";
import type { ControlPoint } from "@/domain/route-planning/model";

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
  return (
    <aside
      className={`route-metrics widget${selectedLeg ? " is-leg-selected" : ""}`}
      aria-label="路线摘要"
    >
      <header className="widget-title">
        <div><small>{selectedLeg ? "当前路段" : "完整环线"}</small><h2>{selectedLeg ? `路段 ${route.legs.indexOf(selectedLeg) + 1}` : `${controlPoints.length} 个控制点`}</h2></div>
        <span className="status-dot">路线有效</span>
      </header>
      <div className="metric-grid">
        <div><DistanceIcon /><span><small>预计里程</small><strong>{formatDistance(distance)}</strong></span></div>
        <div><ClockIcon /><span><small>预计驾驶</small><strong>{formatDuration(duration)}</strong></span></div>
      </div>
      <footer>数据来自{provider === "amap" ? "高德" : "腾讯"}地图 · 预计值仅供参考</footer>
    </aside>
  );
}
