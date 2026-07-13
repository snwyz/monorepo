import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import type { SichuanSyncDto } from "./dto/sichuan-sync.dto";
import { DbService } from "../db/db.service";

type TencentDivision = {
  id: string | number;
  name?: string;
  fullname: string;
  location: { lat: number; lng: number };
};

@Injectable()
export class RegionsService {
  private readonly syncInFlight = new Map<
    string,
    Promise<{ created_or_updated: number }>
  >();
  constructor(
    private readonly db: DbService,
    private readonly config: ConfigService,
  ) {}

  async syncProvinceFromTencent(provinceCode: string) {
    const existing = this.syncInFlight.get(provinceCode);
    if (existing) return existing;
    const task = this.fetchAndSyncProvince(provinceCode).finally(() => {
      this.syncInFlight.delete(provinceCode);
    });
    this.syncInFlight.set(provinceCode, task);
    return task;
  }

  private async fetchAndSyncProvince(provinceCode: string) {
    const cityList = await this.tencentGet<{ result: TencentDivision[][] }>(
      "/ws/district/v1/list",
      { output: "json" },
    );
    const province = cityList.result[0]?.find(
      (item) => String(item.id) === provinceCode,
    );
    if (!province) {
      throw new BadRequestException("Tencent Map did not return the requested province");
    }

    const cities = await this.getTencentChildren(String(province.id));
    const districts: Array<{
      code: string;
      name: string;
      fullName: string;
      latitude: number;
      longitude: number;
      cityCode: string;
      cityName: string;
    }> = [];
    for (const city of cities) {
      const cityDistricts = await this.getTencentChildren(String(city.id));
      districts.push(
        ...cityDistricts.map((district) => ({
        code: String(district.id),
        name: district.name ?? district.fullname,
        fullName: district.fullname,
        latitude: district.location.lat,
        longitude: district.location.lng,
        cityCode: String(city.id),
        cityName: city.fullname,
        })),
      );
    }
    return this.syncProvince({
      coordinateSystem: "gcj02",
      province: this.toDtoDivision(province),
      cities: cities.map((city) => this.toDtoDivision(city)),
      districts,
    });
  }

  async syncProvince(dto: SichuanSyncDto) {
    const cityCodes = new Set(dto.cities.map((city) => city.code));
    if (dto.districts.some((district) => !cityCodes.has(district.cityCode))) {
      throw new BadRequestException("Every district must belong to a city in this snapshot");
    }

    const divisions = [
      { ...dto.province, level: 1, parent_code: null, province_code: dto.province.code },
      ...dto.cities.map((city) => ({
        ...city,
        level: 2,
        parent_code: dto.province.code,
        province_code: dto.province.code,
      })),
      ...dto.districts.map((district) => ({
        ...district,
        level: 3,
        parent_code: district.cityCode,
        province_code: dto.province.code,
      })),
    ];
    await this.db.$transaction(
      divisions.map((division) =>
        this.db.administrativeDivision.upsert({
          where: { code: division.code },
          create: {
            code: division.code,
            province_code: division.province_code,
            name: division.name,
            full_name: division.fullName,
            level: division.level,
            parent_code: division.parent_code,
            lat: division.latitude,
            lng: division.longitude,
            coordinate_system: dto.coordinateSystem,
            source: "tencent-map",
          },
          update: {
            name: division.name,
            full_name: division.fullName,
            level: division.level,
            parent_code: division.parent_code,
            lat: division.latitude,
            lng: division.longitude,
            coordinate_system: dto.coordinateSystem,
            source: "tencent-map",
          },
        }),
      ),
    );
    return { created_or_updated: divisions.length };
  }

  async findDistricts(provinceCode: string) {
    if (!provinceCode) throw new BadRequestException("province_code is required");
    return this.db.administrativeDivision.findMany({
      where: { province_code: provinceCode, level: 3 },
      orderBy: [{ parent_code: "asc" }, { code: "asc" }],
      select: {
        code: true,
        province_code: true,
        name: true,
        full_name: true,
        parent_code: true,
        lat: true,
        lng: true,
        coordinate_system: true,
        synced_at: true,
      },
    });
  }

  private async getTencentChildren(parentCode: string) {
    const response = await this.tencentGet<{
      result: TencentDivision[][];
    }>("/ws/district/v1/getchildren", { id: parentCode, output: "json" });
    return response.result[0] ?? [];
  }

  private toDtoDivision(division: {
    id: string | number;
    name?: string;
    fullname: string;
    location: { lat: number; lng: number };
  }) {
    return {
      code: String(division.id),
      name: division.name ?? division.fullname,
      fullName: division.fullname,
      latitude: division.location.lat,
      longitude: division.location.lng,
    };
  }

  private async tencentGet<T>(path: string, params: Record<string, string>) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const key = this.config.getOrThrow<string>("TENCENT_MAP_KEY").trim();
    const secret = this.config.getOrThrow<string>("TENCENT_MAP_SK").trim();
    const sortedEntries = Object.entries({ ...params, key }).sort(
      ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
    );
    // 腾讯要求使用未编码的原始参数计算 sig；SDK 内部也是这个排序规则。
    const unsignedQuery = sortedEntries
      .map(([name, value]) => `${name}=${value}`)
      .join("&");
    const sig = createHash("md5")
      .update(`${path}?${unsignedQuery}${secret}`)
      .digest("hex");
    const encodedQuery = sortedEntries
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join("&");
    const response = await fetch(
      `https://apis.map.qq.com${path}?${encodedQuery}&sig=${sig}`,
    );
    const body = (await response.json()) as T & { status: number; message: string };
    if (!response.ok || body.status !== 0) {
      throw new BadRequestException(body.message || "Tencent Map request failed");
    }
    return body;
  }
}
