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
      <View>
        <Text>加载中...</Text>
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
    <ScrollView scrollY>
      <View style={{ padding: "16px" }}>
        <Text style={{ fontSize: "20px", fontWeight: "bold" }}>
          {route.title}
        </Text>
        <Text>
          {route.distance_km} km · {route.duration_hours} h
        </Text>
        <Text>{route.description}</Text>
        <View onClick={toggle}>
          <Text>{collected ? "★ 已收藏" : "☆ 收藏路线"}</Text>
        </View>
        <Text>沿途补给点</Text>
        {pois.map((poi) => (
          <View key={poi.id}>
            <Text>
              {poi.type === "rv_camp" ? "🚐" : "⚡"} {poi.name}
            </Text>
            <Text>{poi.description}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
