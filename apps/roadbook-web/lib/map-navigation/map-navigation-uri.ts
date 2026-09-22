import type { WebMapProvider } from "@roadbook/map/web";

interface MapNavigationPoint {
  latitude: number;
  longitude: number;
  name: string;
}

interface CreateMapNavigationUriOptions {
  provider: WebMapProvider;
  from: MapNavigationPoint;
  to: MapNavigationPoint;
}

export function createMapNavigationUri({
  provider,
  from,
  to,
}: CreateMapNavigationUriOptions) {
  if (provider === "tencent") {
    const params = new URLSearchParams({
      type: "drive",
      from: from.name,
      fromcoord: `${from.latitude},${from.longitude}`,
      to: to.name,
      tocoord: `${to.latitude},${to.longitude}`,
      coord_type: "2",
      policy: "0",
      referer: "roadbook",
    });
    return `https://apis.map.qq.com/uri/v1/routeplan?${params.toString()}`;
  }

  const params = new URLSearchParams({
    from: `${from.longitude},${from.latitude},${from.name}`,
    to: `${to.longitude},${to.latitude},${to.name}`,
    mode: "car",
    policy: "1",
    src: "roadbook",
    callnative: "1",
  });
  return `https://uri.amap.com/navigation?${params.toString()}`;
}
