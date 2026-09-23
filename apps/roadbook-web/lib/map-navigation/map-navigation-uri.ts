import type { WebMapProvider } from "@roadbook/map/web";

interface MapNavigationPoint {
  latitude: number;
  longitude: number;
  name: string;
}

interface CreateMapNavigationUriOptions {
  provider: WebMapProvider;
  from?: MapNavigationPoint;
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
      fromcoord: from
        ? `${from.latitude},${from.longitude}`
        : "CurrentLocation",
      to: to.name,
      tocoord: `${to.latitude},${to.longitude}`,
      referer: process.env.NEXT_PUBLIC_TENCENT_MAP_KEY ?? "",
    });
    if (from) params.set("from", from.name);
    return `qqmap://map/routeplan?${params.toString()}`;
  }

  const params = new URLSearchParams({
    sourceApplication: "Roadbook",
    dlat: String(to.latitude),
    dlon: String(to.longitude),
    dname: to.name,
    dev: "0",
    t: "0",
  });
  if (from) {
    params.set("slat", String(from.latitude));
    params.set("slon", String(from.longitude));
    params.set("sname", from.name);
  }
  return `amapuri://route/plan/?${params.toString()}`;
}
