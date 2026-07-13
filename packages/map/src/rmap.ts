import type {
  AdministrativeDivision,
  QQCityListResponse,
  QQMapDivision,
  QQMapSdk,
  ProvinceDistrict,
  ProvinceDistrictSnapshot,
} from "./types";
import QQMapWX from "../lib/qqmap-wx-jssdk.min.js";


export class RMapError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "RMapError";
  }
}

/**
 * 腾讯地图 SDK 的领域门面。新地图能力只需在这里新增一个用例方法，
 * SDK 调用细节和回调式 API 不会泄漏到页面或业务服务。
 */
export class RMap {
  private readonly sdk: QQMapSdk;

  constructor(options: { key: string; sdk?: QQMapSdk }) {
    if (!options.key.trim()) throw new RMapError("Tencent Map key is required");
    this.sdk = options.sdk ?? RMap.createTencentSdk(options.key);
  }

  async getCityList(): Promise<AdministrativeDivision[][]> {
    const response = await new Promise<QQCityListResponse>((resolve, reject) =>
      this.sdk.getCityList({ success: resolve, fail: reject }),
    );
    this.assertSuccess(response.status, response.message);
    return response.result.map((level) => level.map(RMap.toDivision));
  }

  async getDistrictByCityId(cityCode: string): Promise<AdministrativeDivision[]> {
    const response = await new Promise<QQCityListResponse>((resolve, reject) =>
      this.sdk.getDistrictByCityId({ id: cityCode, success: resolve, fail: reject }),
    );
    this.assertSuccess(response.status, response.message);
    return (response.result[0] ?? []).map(RMap.toDivision);
  }

  /** 获取任一省级行政区下的地市与区县快照。 */
  async getProvinceDistrictSnapshot(
    provinceCode: string,
  ): Promise<ProvinceDistrictSnapshot> {
    const [provinces] = await this.getCityList();
    const province = provinces.find((division) => division.code === provinceCode);
    if (!province) throw new RMapError(`Province ${provinceCode} was not returned by Tencent Map`);

    const cities = await this.getDistrictByCityId(province.code);
    const districtGroups = await Promise.all(
      cities.map(async (city) => ({
        city,
        districts: await this.getDistrictByCityId(city.code),
      })),
    );
    const districts: ProvinceDistrict[] = [];
    for (const group of districtGroups) {
      for (const district of group.districts) {
        districts.push({
          ...district,
          cityCode: group.city.code,
          cityName: group.city.fullName,
        });
      }
    }

    return { coordinateSystem: "gcj02", province, cities, districts };
  }

  /** 保持已有四川调用兼容；新代码应使用 getProvinceDistrictSnapshot("510000")。 */
  async getSichuanDistrictSnapshot(): Promise<ProvinceDistrictSnapshot> {
    return this.getProvinceDistrictSnapshot("510000");
  }

  private static createTencentSdk(key: string): QQMapSdk {
    return new QQMapWX({ key });
  }

  private static toDivision(source: QQMapDivision): AdministrativeDivision {
    if (!source.location || !Number.isFinite(source.location.lat) || !Number.isFinite(source.location.lng)) {
      throw new RMapError(`Tencent Map returned an invalid center point for ${source.fullname}`);
    }
    return {
      code: String(source.id),
      name: source.name ?? source.fullname,
      fullName: source.fullname,
      latitude: source.location.lat,
      longitude: source.location.lng,
      pinyin: source.pinyin ?? [],
    };
  }

  private assertSuccess(status: number, message: string) {
    if (status !== 0) throw new RMapError(message || `Tencent Map request failed: ${status}`);
  }
}
