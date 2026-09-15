import { RMap } from "@roadbook/map";
import { http } from "./http";

let rmap: RMap | undefined;

export function getRMap() {
  if (!rmap) {
    rmap = new RMap({ key: process.env.TARO_APP_TENCENT_MAP_KEY ?? "" });
  }
  return rmap;
}

/** 从腾讯位置服务读取四川行政区划，并将最新快照幂等同步到 API。 */
export async function syncProvinceDistricts(provinceCode: string) {
  return http.post<{ data: { created_or_updated: number } }>(
    "/regions/sync",
    { province_code: provinceCode },
  );
}
