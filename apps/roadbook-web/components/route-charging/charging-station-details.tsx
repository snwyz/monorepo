"use client";

import { ArrowUpRight, Plus, RotateCw } from "lucide-react";
import type { WebMapProvider } from "@roadbook/map/web";
import type { RouteChargingCandidate } from "@/domain/route-charging/model";
import { Button } from "@/components/ui/button";
import { useChargingStationDetails } from "@/hooks/use-charging-station-details";
import { createMapNavigationUri } from "@/lib/map-navigation/map-navigation-uri";

interface Props {
  station: RouteChargingCandidate;
  provider: WebMapProvider;
  addDisabledReason?: string;
  onAdd: (station: RouteChargingCandidate) => void;
}

export function ChargingStationDetails({ station, provider, addDisabledReason, onAdd }: Props) {
  const { result, stale, error, loading, retry } = useChargingStationDetails(station.id);
  const details = result?.details;
  const updatedAt = result ? new Date(result.fetchedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : null;
  const power = details?.maximumPowerKw ?? station.maximumPowerKw;
  const total = details?.totalStalls ?? station.stallCount;
  return <div className="charging-details">
    <div className="charging-details__metrics" aria-live="polite" aria-busy={loading}>
      <div><span>可用充电桩</span><strong>{details?.availableStalls ?? "—"}<small> / {total ?? "—"}</small></strong></div>
      <div><span>最高功率</span><strong>{power ?? "—"}<small> kW</small></strong></div>
    </div>
    <div className="charging-details__freshness" role="status">
      <span>{result ? `${updatedAt} 查询${stale ? " · 缓存待更新" : " · 桩位会变化"}${error ? " · 更新失败" : loading ? " · 更新中" : ""}` : error ?? "正在查询桩位…"}</span>
      <button type="button" onClick={retry} disabled={loading} aria-label="刷新充电站详情" title="刷新桩位"><RotateCw size={13} aria-hidden="true" /></button>
    </div>
    <p className="charging-details__address">{station.address || "暂无详细地址"}</p>
    <div className="charging-details__tags">
      <span>{station.openToNonTesla === true ? "向其他品牌开放" : station.openToNonTesla === false ? "仅 Tesla 车辆" : "其他品牌适用性待确认"}</span>
      {details?.amenities.includes("AMENITIES_WIFI") ? <span>Wi-Fi</span> : null}
      {details?.amenities.includes("AMENITIES_FLOOR_LOCKS") ? <span>设有地锁</span> : null}
    </div>
    {station.note ? <p className="charging-details__note">{station.note}</p> : null}
    <div className="charging-details__actions">
      <Button type="button" onClick={() => onAdd(station)} disabled={Boolean(addDisabledReason)} title={addDisabledReason ?? "加入路线对应位置并重新规划"}><Plus size={16} aria-hidden="true" />加入途经点</Button>
      <Button asChild variant="outline">
        <a href={createMapNavigationUri({ provider, to: { name: station.name, ...station.coordinate } })}><ArrowUpRight size={16} aria-hidden="true" />导航到这里</a>
      </Button>
    </div>
    {addDisabledReason ? <p className="charging-details__note">{addDisabledReason}</p> : null}
  </div>;
}
