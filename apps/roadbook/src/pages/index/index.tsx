// AI [2026-07-13]: 显示地图搜索半径与附近路线标记
import { useCallback, useEffect, useState } from 'react';
import { Button, Map, Slider, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { RouteMarker } from '@roadbook/types';
import { http } from '../../services/http';
import { syncSichuanDistricts } from '../../services/map';
export default function IndexPage() {
  const [center, setCenter] = useState({ lat: 30.5728, lng: 104.0668 }),
    [radius, setRadius] = useState(100),
    [routes, setRoutes] = useState<RouteMarker[]>([]),
    [syncing, setSyncing] = useState(false);
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
        Taro.showToast({ title: '加载失败', icon: 'none' });
      }
    },
    [center, radius],
  );
  useEffect(() => {
    load();
  }, []);
  const syncDistricts = async () => {
    setSyncing(true);
    try {
      const result = await syncSichuanDistricts();
      Taro.showToast({
        title: `已同步 ${result.data.created_or_updated} 条`,
        icon: 'success',
      });
    } catch (error) {
      console.error('[map] Sichuan district sync failed', error);
      Taro.showToast({ title: '区县同步失败', icon: 'none' });
    } finally {
      setSyncing(false);
    }
  };
  return (
    <View className='min-h-screen bg-slate-50'>
      <Map
        className='h-[85vh] w-full'
        latitude={center.lat}
        longitude={center.lng}
        markers={routes.map((r, i) => ({
          id: i,
          iconPath: '',
          width: 28,
          height: 36,
          latitude: r.start_lat,
          longitude: r.start_lng,
          title: r.title,
        }))}
        onMarkerTap={(e) => {
          const r = routes[Number(e.detail.markerId)];
          if (r)
            Taro.navigateTo({ url: `/pages/route-detail/index?id=${r.id}` });
        }}
        onError={() => Taro.showToast({ title: '地图加载失败', icon: 'none' })}
      />
      <View className='bg-white px-4 py-3 shadow-sm'>
        <Text className='mb-2 block text-sm font-medium text-slate-700 text-red-500'>
          搜索半径：{radius} km
        </Text>
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
        <Button
          className='mt-2 rounded-lg text-sm'
          size='mini'
          type='primary'
          loading={syncing}
          disabled={syncing}
          onClick={syncDistricts}
        >
          同步四川区县
        </Button>
      </View>
    </View>
  );
}
