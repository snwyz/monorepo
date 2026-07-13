export interface AdministrativeDivision {
  code: string;
  name: string;
  fullName: string;
  latitude: number;
  longitude: number;
  pinyin: string[];
}

export interface ProvinceDistrict extends AdministrativeDivision {
  cityCode: string;
  cityName: string;
}

export interface ProvinceDistrictSnapshot {
  coordinateSystem: "gcj02";
  province: AdministrativeDivision;
  cities: AdministrativeDivision[];
  districts: ProvinceDistrict[];
}

export interface QQMapSdk {
  getCityList(options: QQMapCallbackOptions<QQCityListResponse>): void;
  getDistrictByCityId(
    options: QQMapCallbackOptions<QQDistrictResponse> & { id: string },
  ): void;
}

export interface QQMapCallbackOptions<T> {
  success(response: T): void;
  fail(error: unknown): void;
}

export interface QQMapDivision {
  id: number | string;
  name?: string;
  fullname: string;
  location: { lat: number; lng: number };
  pinyin?: string[];
}

export interface QQCityListResponse {
  status: number;
  message: string;
  result: QQMapDivision[][];
}

export interface QQDistrictResponse {
  status: number;
  message: string;
  result: QQMapDivision[][];
}
