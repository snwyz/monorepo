// AI [2026-07-13]: 展示路线详情、沿途 POI 与收藏操作
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import type { PoiItem, RouteDetail } from "@roadbook/types";
import { isLoggedIn } from "../../services/auth";
import { http } from "../../services/http";

export default function RouteDetailPage() {
  const { params } = useRouter();
  const id = params.id ?? "";
  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [pois, setPois] = useState<PoiItem[]>([]);
  const [collected, setCollected] = useState(false);
  useEffect(() => {
    http.get<RouteDetail>(`/routes/${id}`).then((r) => {
      setRoute(r);
      setCollected(r.is_collected);
    });
    http
      .get<{ data: PoiItem[] }>(`/pois/near-route?route_id=${id}`)
      .then((r) => setPois(r.data));
  }, [id]);
  if (!route)
    return (
      <View className="flex min-h-screen items-center justify-center bg-slate-50">
        <Text className="text-slate-500">加载中...</Text>
      </View>
    );
  const toggle = async () => {
    if (!isLoggedIn())
      return Taro.showToast({ title: "请先登录", icon: "none" });
    try {
      if (collected) await http.delete(`/routes/${id}/collection`);
      else await http.post(`/routes/${id}/collection`);
      setCollected(!collected);
    } catch {
      Taro.showToast({ title: "操作失败", icon: "none" });
    }
  };
  return (
    <ScrollView className="h-screen bg-slate-50" scrollY>
      <View className="p-4">
        <Text className="mb-2 block text-2xl font-bold text-slate-900">
          {route.title}
        </Text>
        <Text className="mb-3 block text-sm text-slate-500">
          {route.distance_km} km · {route.duration_hours} h
        </Text>
        <Text className="mb-4 block text-base leading-7 text-slate-700">
          {route.description}
        </Text>
        <View className="mb-6 rounded-lg bg-emerald-600 px-4 py-3" onClick={toggle}>
          <Text className="font-medium text-white">
            {collected ? "★ 已收藏" : "☆ 收藏路线"}
          </Text>
        </View>
        <Text className="mb-3 block text-lg font-semibold text-slate-900">
          沿途补给点
        </Text>
        {pois.map((poi) => (
          <View key={poi.id} className="mb-3 rounded-xl bg-white p-4 shadow-sm">
            <Text className="mb-1 block font-medium text-slate-800">
              {poi.type === "rv_camp" ? "🚐" : "⚡"} {poi.name}
            </Text>
            <Text className="text-sm text-slate-500">{poi.description}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
