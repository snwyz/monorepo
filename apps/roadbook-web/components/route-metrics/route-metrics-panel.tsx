"use client";

import type { ClosedDrivingRoute, WebMapProvider } from "@roadbook/map/web";
import { useState } from "react";

import { ClockIcon, DistanceIcon } from "@/components/ui/icons";
import type { ControlPoint } from "@/domain/route-planning/model";

interface RouteMetricsPanelProps {
  route: ClosedDrivingRoute;
  provider: WebMapProvider;
  controlPoints: ControlPoint[];
  selectedRouteLegId: string | null;
}

function formatDistance(meters: number) {
  return <>{meters >= 1000 ? (meters / 1000).toFixed(meters >= 100_000 ? 0 : 1) : Math.round(meters)} <em className="metric-unit">{meters >= 1000 ? "km" : "m"}</em></>;
}

function formatDuration(minutes: number) {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return <>{hours > 0 && <>{hours} <em className="metric-unit">小时</em>{" "}</>}{rest} <em className="metric-unit">{hours ? "分" : "分钟"}</em></>;
}

export function RouteMetricsPanel({
  route,
  provider,
  controlPoints,
  selectedRouteLegId,
}: RouteMetricsPanelProps) {
  const [showOneWayDistance, setShowOneWayDistance] = useState(false);
  const selectedLeg = route.legs.find((leg) => leg.id === selectedRouteLegId) ?? null;
  const oneWayDistance = route.legs
    .slice(0, -1)
    .reduce((total, leg) => total + leg.distanceMeters, 0);
  const oneWayDuration = route.legs
    .slice(0, -1)
    .reduce((total, leg) => total + leg.durationMinutes, 0);
  const distance = selectedLeg?.distanceMeters
    ?? (showOneWayDistance ? oneWayDistance : route.distanceMeters);
  const duration = selectedLeg?.durationMinutes
    ?? (showOneWayDistance ? oneWayDuration : route.durationMinutes);
  const travelScopeLabel = showOneWayDistance ? "单程" : "往返";
  const nextTravelScopeLabel = showOneWayDistance ? "往返" : "单程";
  const distanceLabel = selectedLeg ? "路段里程" : `${travelScopeLabel}里程`;
  const durationLabel = selectedLeg ? "预计驾驶" : `${travelScopeLabel}用时`;
  return (
    <aside
      data-glass="desktop" className={`route-metrics widget${selectedLeg ? " is-leg-selected" : ""}`}
      aria-label="路线摘要"
    >
      <header className="widget-title">
        <div><small>{selectedLeg ? "当前路段" : "完整环线"}</small><h2>{selectedLeg ? `路段 ${route.legs.indexOf(selectedLeg) + 1}` : `${controlPoints.length} 个途经点`}</h2></div>
      </header>
      <div className="metric-grid">
        {selectedLeg ? (
          <div className="metric-grid__item">
            <DistanceIcon />
            <span><small>{distanceLabel}</small><strong>{formatDistance(distance)}</strong></span>
          </div>
        ) : (
          <button
            type="button"
            className="metric-grid__item metric-grid__toggle"
            aria-label={`当前显示${travelScopeLabel}里程和用时，点击切换为${nextTravelScopeLabel}`}
            aria-pressed={showOneWayDistance}
            title={`切换为${nextTravelScopeLabel}里程和用时`}
            onClick={() => setShowOneWayDistance((current) => !current)}
          >
            <DistanceIcon />
            <span><small>{distanceLabel}</small><strong aria-live="polite">{formatDistance(distance)}</strong></span>
          </button>
        )}
        <div className="metric-grid__item"><ClockIcon /><span><small>{durationLabel}</small><strong aria-live="polite">{formatDuration(duration)}</strong></span></div>
      </div>
      <footer>数据来自{provider === "amap" ? "高德" : "腾讯"}地图 · 预计值仅供参考</footer>
    </aside>
  );
}
