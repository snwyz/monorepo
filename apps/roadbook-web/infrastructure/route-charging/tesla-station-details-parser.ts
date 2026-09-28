import type { ChargingStationDetails, ChargingTariff } from "@/domain/route-charging/model";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numeric(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function count(value: unknown): number | null {
  const parsed = numeric(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function tariff(payload: Record<string, unknown>): ChargingTariff {
  return {
    current: {
      base: numeric(payload.nowRate),
      service: numeric(payload.nowRateSvc),
      electricity: numeric(payload.nowRateElc),
    },
    maximumParkingRate: numeric(payload.maxParkingRate),
    periods: Array.isArray(payload.hourRateList) ? payload.hourRateList.filter(record).map((period) => ({
      start: numeric(period.start),
      end: numeric(period.end),
      days: text(period.days),
      serviceDays: text(period.svcDays),
      electricityDays: text(period.elcDays),
      rate: {
        base: numeric(period.rateBase),
        service: numeric(period.rateSvc),
        electricity: numeric(period.rateElc),
      },
    })) : [],
  };
}

export function parseTeslaStationDetails(payload: unknown, sourceSiteId: string): ChargingStationDetails {
  if (!record(payload) || String(payload.trtid) !== sourceSiteId) {
    throw new Error("特斯拉站点详情与请求不匹配");
  }
  const totalStalls = count(payload.allChargerCount);
  const availableStalls = count(payload.availableChargerCount);
  const maximumPower = numeric(payload.maxPowerKW);
  if (totalStalls === null && maximumPower === null && !text(payload.siteUsabilityArchetype)) {
    throw new Error("特斯拉站点详情缺少有效数据");
  }
  return {
    sourceSiteId,
    totalStalls,
    availableStalls: availableStalls !== null && totalStalls !== null && availableStalls > totalStalls
      ? null : availableStalls,
    maximumPowerKw: maximumPower !== null && maximumPower > 0 ? maximumPower : null,
    amenities: Array.isArray(payload.amenities)
      ? payload.amenities.filter((item): item is string => typeof item === "string") : [],
    usabilityStatus: text(payload.siteUsabilityArchetype),
    availabilityIndicator: count(payload.isAvailableCharger),
    teslaTariff: tariff(payload),
    nonTeslaTariff: record(payload.noneTeslaRate) ? tariff(payload.noneTeslaRate) : null,
  };
}
