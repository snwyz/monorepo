"use client";

import type { RouteTravelMode, WebMapProvider } from "@roadbook/map/web";
import { ArrowLeft, Navigation, RotateCw } from "lucide-react";
import { useId } from "react";
import type { ControlPoint, RouteCalculationStatus } from "@/domain/route-planning/model";
import { routeTravelModeLabels } from "@/domain/route-planning/route-leg-travel-mode";
import { createMapNavigationUri } from "@/lib/map-navigation/map-navigation-uri";
import { RouteTravelModeIcon } from "./route-travel-mode-icon";

interface RouteLegDetailProps {
  index: number;
  from: ControlPoint;
  to: ControlPoint;
  mode: RouteTravelMode;
  provider: WebMapProvider;
  status: RouteCalculationStatus;
  error: string | null;
  onModeChange: (mode: RouteTravelMode) => void;
  onRetry: () => void;
  onBack: () => void;
}

export function RouteLegDetail({ index, from, to, mode, provider, status, error, onModeChange, onRetry, onBack }: RouteLegDetailProps) {
  const groupId = useId();
  const updating = status === "updating";
  return (
    <section className="workspace-leg-detail" aria-label={`路段 ${index + 1} 详情`}>
      <button type="button" className="workspace-leg-detail__back" onClick={onBack}><ArrowLeft aria-hidden="true" size={16} />返回当前规划</button>
      <h2>路段 {index + 1}</h2>
      <div className="route-leg-endpoints">
        <span title={from.name}><i aria-hidden="true" />{from.name}</span>
        <span title={to.name}><i aria-hidden="true" />{to.name}</span>
      </div>
      <fieldset className="route-travel-mode">
        <legend>出行方式</legend>
        <div className="route-travel-mode__segments">
          {(["driving", "cycling", "walking"] as const).map((value) => (
            <label key={value} className={`route-travel-mode__option${value === mode ? " is-selected" : ""}`}>
              <input type="radio" name={groupId} value={value} checked={value === mode} onChange={() => onModeChange(value)} />
              <RouteTravelModeIcon mode={value} /><span>{routeTravelModeLabels[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="route-leg-feedback" role="status" aria-live="polite">
        <span>{updating ? "正在更新道路与用时，地图暂显示上次结果。" : error ? error : mode === "driving" ? "汽车路段遵循全程驾车策略。" : `此段按${routeTravelModeLabels[mode]}道路规划，不使用高速策略。`}</span>
        {error && status === "failed" ? <button type="button" className="route-leg-retry" aria-label="重新计算" title="重新计算" onClick={onRetry}><RotateCw size={16} aria-hidden="true" /></button> : null}
      </div>
      <a className="route-leg-navigation" href={createMapNavigationUri({ provider, from, to, travelMode: mode })}>
        <Navigation size={16} aria-hidden="true" />在{provider === "amap" ? "高德" : "腾讯"}地图中{mode === "driving" ? "驾车" : routeTravelModeLabels[mode]}
      </a>
    </section>
  );
}
