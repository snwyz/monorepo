export interface ChargingCoordinate {
  latitude: number;
  longitude: number;
}

export interface ChargingStation {
  id: string;
  /** 特斯拉详情接口使用 trt_id，与目录 location_id 分开保存。 */
  sourceSiteId: string | null;
  name: string;
  address: string;
  coordinate: ChargingCoordinate;
  stallCount: number | null;
  maximumPowerKw: number | null;
  openToNonTesla: boolean | null;
  note: string | null;
}

/** 计费原始字段；供应商尚未提供字段单位说明，不直接推算总价。 */
export interface ChargingRate {
  base: number | null;
  service: number | null;
  electricity: number | null;
}

export interface ChargingRatePeriod {
  start: number | null;
  end: number | null;
  days: string | null;
  serviceDays: string | null;
  electricityDays: string | null;
  rate: ChargingRate;
}

export interface ChargingTariff {
  current: ChargingRate;
  periods: ChargingRatePeriod[];
  /** 对应 maxParkingRate，单位及具体费用类型待确认。 */
  maximumParkingRate: number | null;
}

export interface ChargingStationDetails {
  sourceSiteId: string;
  totalStalls: number | null;
  availableStalls: number | null;
  maximumPowerKw: number | null;
  amenities: string[];
  usabilityStatus: string | null;
  /** 保留 isAvailableCharger 原值，不推断非特斯拉车辆可用性。 */
  availabilityIndicator: number | null;
  teslaTariff: ChargingTariff;
  nonTeslaTariff: ChargingTariff | null;
}

export interface ChargingStationDetailsResult {
  stationId: string;
  source: "tesla";
  /** 本服务抓取时间，不是供应商保证的数据更新时间。 */
  fetchedAt: string;
  details: ChargingStationDetails;
}

export interface RouteChargingStation extends ChargingStation {
  /** 到道路折线的近似直线距离，不是驶入距离。 */
  distanceFromRouteMeters: number;
  /** 沿道路折线至最近投影点的估算里程，不是到站导航里程。 */
  distanceAlongRouteMeters: number;
}

export interface RouteChargingResult {
  source: "tesla";
  fetchedAt: string;
  stale: boolean;
  radiusMeters: number;
  stations: RouteChargingStation[];
}

/** 全路线候选保留插入锚点，界面不要求用户选择路段。 */
export interface RouteChargingCandidate extends RouteChargingStation {
  fromControlPointId: string;
  toControlPointId: string;
}

export interface WholeRouteChargingResult extends Omit<RouteChargingResult, "stations"> {
  stations: RouteChargingCandidate[];
}
