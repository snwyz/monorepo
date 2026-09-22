"use client";

import type { WebMapProvider } from "@roadbook/map/web";

import { Switch } from "@/components/ui/switch";

interface MapProviderSwitchProps {
  provider: WebMapProvider;
  loading: boolean;
  onProviderChange: (provider: WebMapProvider) => void;
}

export function MapProviderSwitch({
  provider,
  loading,
  onProviderChange,
}: MapProviderSwitchProps) {
  const isTencent = provider === "tencent";
  return (
    <section className="map-provider-switch widget" aria-label="地图供应商">
      <span className={!isTencent ? "is-active" : undefined}>高德地图</span>
      <Switch
        checked={isTencent}
        disabled={loading}
        aria-label={`切换到${isTencent ? "高德地图" : "腾讯地图"}`}
        title={`切换到${isTencent ? "高德地图" : "腾讯地图"}`}
        onCheckedChange={(checked) => onProviderChange(checked ? "tencent" : "amap")}
      />
      <span className={isTencent ? "is-active" : undefined}>腾讯地图</span>
    </section>
  );
}
