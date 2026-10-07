"use client";

import type { DrivingRoute, WebMapProvider } from "@roadbook/map/web";

import { ClockIcon, DistanceIcon } from "@/components/ui/icons";
import type { ControlPoint } from "@/domain/route-planning/model";

interface RouteMetricsPanelProps {
  route: DrivingRoute;
  provider: WebMapProvider;
  controlPoints: ControlPoint[];
  selectedRouteLegId: string | null;
  includeReturn: boolean;
  returnRouteLoading: boolean;
  returnRouteError: string | null;
  onToggleReturn: () => void;
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
  includeReturn,
  returnRouteLoading,
  returnRouteError,
  onToggleReturn,
}: RouteMetricsPanelProps) {
  const selectedLeg = route.legs.find((leg) => leg.id === selectedRouteLegId) ?? null;
  const distance = selectedLeg?.distanceMeters ?? route.distanceMeters;
  const duration = selectedLeg?.durationMinutes ?? route.durationMinutes;
  const travelScopeLabel = route.scope === "round-trip" ? "往返" : "单程";
  const nextTravelScopeLabel = includeReturn ? "单程" : "往返";
  const distanceLabel = selectedLeg ? "路段里程" : `${travelScopeLabel}里程`;
  const durationLabel = selectedLeg ? "预计驾驶" : `${travelScopeLabel}用时`;
  return (
    <aside
      data-glass="desktop" className={`route-metrics widget${selectedLeg ? " is-leg-selected" : ""}`}
      aria-label="路线摘要"
    >
      <header className="widget-title">
        <div><small>{selectedLeg ? "当前路段" : `${travelScopeLabel}路线`}</small><h2>{selectedLeg ? `路段 ${route.legs.indexOf(selectedLeg) + 1}` : `${controlPoints.length} 个途经点`}</h2></div>
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
            aria-label={returnRouteLoading ? "正在计算返程，点击取消并保留单程" : `当前显示${travelScopeLabel}里程和用时，点击切换为${nextTravelScopeLabel}路线`}
            aria-pressed={includeReturn}
            title={returnRouteLoading ? "取消返程计算" : `切换为${nextTravelScopeLabel}里程、用时和路线`}
            onClick={onToggleReturn}
          >
            <DistanceIcon />
            <span><small>{distanceLabel}</small><strong aria-live="polite">{formatDistance(distance)}</strong></span>
          </button>
        )}
        <div className="metric-grid__item"><ClockIcon /><span><small>{durationLabel}</small><strong aria-live="polite">{formatDuration(duration)}</strong></span></div>
      </div>
      <footer role="status" title={returnRouteError ?? undefined}>
        {returnRouteLoading ? "正在计算返程 · 再次点击可取消" : returnRouteError ? "返程计算失败，保留单程 · 点击里程重试" : `数据来自${provider === "amap" ? "高德" : "腾讯"}地图 · 预计值`}
      </footer>
    </aside>
  );
}
