"use client";

import { X } from "lucide-react";
import type { WebMapProvider } from "@roadbook/map/web";
import type { RouteChargingCandidate } from "@/domain/route-charging/model";
import { ChargingStationDetails } from "./charging-station-details";
import "./route-charging.css";

interface Props {
  station: RouteChargingCandidate;
  provider: WebMapProvider;
  stale: boolean;
  addDisabledReason?: string;
  onAdd: (station: RouteChargingCandidate) => void;
  onClose: () => void;
}

export function RouteChargingPanel({ station, provider, stale, addDisabledReason, onAdd, onClose }: Props) {
  return <section className="route-charging" aria-label="充电站详情">
    <header className="route-charging__header">
      <div><span className="route-charging__eyebrow">TESLA SUPERCHARGER</span><h2>{station.name}</h2></div>
      <button type="button" className="route-charging__close" aria-label="关闭充电站详情" title="返回路线" onClick={onClose}><X size={16} /></button>
    </header>
    <div className="route-charging__body">
      <ChargingStationDetails key={station.id} station={station} provider={provider} addDisabledReason={addDisabledReason} onAdd={onAdd} />
    </div>
    <footer className="route-charging__footer">
      {stale ? <strong>站点目录待更新，路线更新后将重新确认沿途位置。</strong> : null}
      <span>距路线约 {station.distanceFromRouteMeters >= 1000 ? `${(station.distanceFromRouteMeters / 1000).toFixed(1)} km` : `${station.distanceFromRouteMeters} m`} · 直线距离</span>
      <p>驶入方向、绕行与价格请以实际导航和 Tesla 应用为准。</p>
    </footer>
  </section>;
}
