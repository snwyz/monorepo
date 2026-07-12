// AI [2026-07-13]: 显示地图搜索半径与附近路线标记
import { useCallback, useEffect, useState } from "react";
import { Map, Slider, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { RouteMarker } from "@roadbook/types";
import { http } from "../../services/http";
export default function IndexPage() {
  const [center, setCenter] = useState({ lat: 30.5728, lng: 104.0668 }),
    [radius, setRadius] = useState(100),
    [routes, setRoutes] = useState<RouteMarker[]>([]);
  const load = useCallback(
    async (c = center, r = radius) => {
      try {
        setRoutes(
          (
            await http.get<{ data: RouteMarker[] }>(
              `/routes/nearby?lat=${c.lat}&lng=${c.lng}&radius_km=${r}`,
            )
          ).data,
        );
      } catch {
        Taro.showToast({ title: "加载失败", icon: "none" });
      }
    },
    [center, radius],
  );
  useEffect(() => {
    load();
  }, []);
  return (
    <View>
      <Map
        style={{ width: "100%", height: "85vh" }}
        latitude={center.lat}
        longitude={center.lng}
      markers={routes.map((r, i) => ({
        id: i,
        iconPath: "",
          latitude: r.start_lat,
          longitude: r.start_lng,
          title: r.title,
        }))}
      onMarkerTap={(e) => {
          const r = routes[Number(e.detail.markerId)];
          if (r)
            Taro.navigateTo({ url: `/pages/route-detail/index?id=${r.id}` });
      }}
      onError={() => Taro.showToast({ title: "地图加载失败", icon: "none" })}
      />
      <Text>搜索半径：{radius} km</Text>
      <Slider
        min={10}
        max={500}
        step={10}
        value={radius}
        onChange={(e) => {
          setRadius(e.detail.value);
          load(center, e.detail.value);
        }}
      />
    </View>
  );
}
