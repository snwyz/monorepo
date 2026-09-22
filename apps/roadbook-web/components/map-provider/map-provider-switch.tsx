"use client";

import type { WebMapProvider } from "@roadbook/map/web";

import { CheckIcon, LayersIcon } from "@/components/ui/icons";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

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
  const [expanded, setExpanded] = useState(false);

  const chooseProvider = (nextProvider: WebMapProvider) => {
    if (nextProvider !== provider) onProviderChange(nextProvider);
    setExpanded(false);
  };

  return (
    <section className={`map-provider-switch widget${expanded ? " is-expanded" : ""}`} aria-label="地图供应商">
      <div className="map-provider-switch__standard">
        <span className={!isTencent ? "is-active" : undefined}>高德地图</span>
        <Switch
          checked={isTencent}
          disabled={loading}
          aria-label={`切换到${isTencent ? "高德地图" : "腾讯地图"}`}
          title={`切换到${isTencent ? "高德地图" : "腾讯地图"}`}
          onCheckedChange={(checked) => onProviderChange(checked ? "tencent" : "amap")}
        />
        <span className={isTencent ? "is-active" : undefined}>腾讯地图</span>
      </div>
      <div className="map-provider-switch__compact">
        {expanded ? (
          <div className="map-provider-switch__options" role="group" aria-label="选择地图供应商">
            {(["amap", "tencent"] as const).map((option) => (
              <button
                type="button"
                key={option}
                disabled={loading}
                className={provider === option ? "is-active" : undefined}
                onClick={() => chooseProvider(option)}
              >
                {provider === option ? <CheckIcon /> : null}
                {option === "amap" ? "高德" : "腾讯"}
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className="map-provider-switch__trigger"
          disabled={loading}
          aria-expanded={expanded}
          aria-label={`${provider === "amap" ? "高德" : "腾讯"}地图，${expanded ? "收起" : "展开"}地图切换`}
          title="切换地图"
          onClick={() => setExpanded((value) => !value)}
        >
          <LayersIcon />
        </button>
      </div>
    </section>
  );
}
