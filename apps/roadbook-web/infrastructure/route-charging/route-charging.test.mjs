import assert from "node:assert/strict";
import test from "node:test";

import { findRouteChargingStations } from "../../domain/route-charging/find-route-charging-stations.ts";
import { parseTeslaSuperchargers } from "./tesla-supercharger-parser.ts";
import { parseTeslaStationDetails } from "./tesla-station-details-parser.ts";
import { createChargingStationCache } from "./charging-station-cache.ts";
import { createTeslaStationDetailsCache } from "./tesla-station-details-cache.ts";

const detail = {
  title: "宁波万豪酒店", location_type: "supercharger", address: "和义路188号",
  num_charger_stalls: "3", installed_full_power: "250", note: "物业收取停车费",
};
const directoryItem = {
  trt_id: "31448", location_id: "cnsc9915", qq_lat: 29.877925, qq_lng: 121.552896,
  data: [detail],
};
const liveDetails = {
  trtid: 102302, allChargerCount: 3, availableChargerCount: 3, maxPowerKW: 250,
  amenities: ["AMENITIES_WIFI", "AMENITIES_FLOOR_LOCKS"],
  hourRateList: [{ start: 0, end: 24, days: "", svcDays: "", elcDays: "", rateBase: 0, rateSvc: 1.07, rateElc: 0.82 }],
  maxParkingRate: 6.2, nowRate: 0, nowRateSvc: 1.07, nowRateElc: 0.82,
  isAvailableCharger: 1, siteUsabilityArchetype: "SITE_USABILITY_ARCHETYPE_AVAILABLE",
  noneTeslaRate: { hourRateList: null, nowRate: 0, nowRateSvc: 0, nowRateElc: 0, maxParkingRate: 0 },
};

test("混合目录只保留超充站，按 location_id 去重并独立保留详情 trt_id", () => {
  const stations = parseTeslaSuperchargers([
    { ...directoryItem, data: [{ location_type: "store" }, detail] }, directoryItem,
    { ...directoryItem, location_id: "destination", data: [{ ...detail, location_type: "destination charger" }] },
    { ...directoryItem, location_id: "invalid", qq_lat: null },
    null,
  ]);
  assert.equal(stations.length, 1);
  assert.equal(stations[0].id, "cnsc9915");
  assert.equal(stations[0].sourceSiteId, "31448");
  assert.equal(stations[0].stallCount, 3);
  assert.equal(stations[0].maximumPowerKw, 250);
  assert.equal(stations[0].openToNonTesla, null);
  assert.deepEqual(stations[0].coordinate, { latitude: 29.877925, longitude: 121.552896 });
});

test("目录缺失字段不伪装成零或开放，false 保留为 false", () => {
  const [station] = parseTeslaSuperchargers([{ ...directoryItem, data: [{
    ...detail, num_charger_stalls: "", installed_full_power: null, open_to_non_tesla: false,
  }] }]);
  assert.equal(station.stallCount, null);
  assert.equal(station.maximumPowerKw, null);
  assert.equal(station.openToNonTesla, false);
  assert.throws(() => parseTeslaSuperchargers({ error: "限流" }));
  assert.throws(() => parseTeslaSuperchargers([]));
});

test("详情保留可用桩数、零值及分项费率，不把 nowRate=0 推断成免费", () => {
  const result = parseTeslaStationDetails(liveDetails, "102302");
  assert.equal(result.availableStalls, 3);
  assert.equal(result.maximumPowerKw, 250);
  assert.deepEqual(result.teslaTariff.current, { base: 0, service: 1.07, electricity: 0.82 });
  assert.equal(result.teslaTariff.periods[0].end, 24);
  assert.equal(result.nonTeslaTariff.current.base, 0);
  assert.deepEqual(result.amenities, ["AMENITIES_WIFI", "AMENITIES_FLOOR_LOCKS"]);
  assert.equal(parseTeslaStationDetails({ ...liveDetails, availableChargerCount: 0 }, "102302").availableStalls, 0);
});

test("详情拒绝串站与空壳响应，缺失或矛盾桩数不伪装为实时可用", () => {
  assert.throws(() => parseTeslaStationDetails(liveDetails, "31448"));
  assert.throws(() => parseTeslaStationDetails({ trtid: 102302 }, "102302"));
  for (const value of [undefined, null, "", -1, 4, 1.5]) {
    assert.equal(parseTeslaStationDetails({ ...liveDetails, availableChargerCount: value }, "102302").availableStalls, null);
  }
});

function station(id, latitude, longitude) {
  return { id, coordinate: { latitude, longitude } };
}

test("按道路线段查询而非仅看采样顶点，沿行驶方向排序", () => {
  const path = [{ latitude: 30, longitude: 120 }, { latitude: 30, longitude: 121 }];
  const stations = [station("后", 30, 120.8), station("前", 30.005, 120.2), station("远", 30.1, 120.5)];
  const matches = findRouteChargingStations(stations, path, 2000);
  assert.deepEqual(matches.map((s) => s.id), ["前", "后"]);
  assert.ok(matches[0].distanceFromRouteMeters > 500 && matches[0].distanceFromRouteMeters < 600);
  assert.deepEqual(findRouteChargingStations(stations, path.slice().reverse(), 2000).map((s) => s.id), ["后", "前"]);
});

test("折线路线不以起终点直线替代，重复坐标与空路径安全处理", () => {
  const path = [{ latitude: 30, longitude: 120 }, { latitude: 30, longitude: 121 }, { latitude: 31, longitude: 121 }];
  assert.equal(findRouteChargingStations([station("直线中点", 30.5, 120.5)], path, 2000).length, 0);
  assert.equal(findRouteChargingStations([station("路口", 30, 121)], [...path, path[2]], 2000).length, 1);
  assert.deepEqual(findRouteChargingStations([], [], 2000), []);
});

test("目录并发查询合并为一次下载，成功结果六小时内复用", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const get = createChargingStationCache(async () => { calls++; await gate; return [station("一", 30, 120)]; });
  const first = get();
  const second = get();
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(a.fetchedAt, b.fetchedAt);
  assert.equal((await get()).stale, false);
  assert.equal(calls, 1);
});

test("目录刷新失败可短期降级，二十四小时后拒绝过期目录并限制失败重试频率", async () => {
  let clock = 1_000_000;
  let fail = false;
  let calls = 0;
  const get = createChargingStationCache(async () => {
    calls++;
    if (fail) throw new Error("上游中断");
    return [station("一", 30, 120)];
  }, () => clock);
  const first = await get();
  fail = true;
  clock += 6 * 60 * 60 * 1000;
  assert.equal((await get()).stale, true);
  assert.equal((await get()).fetchedAt, first.fetchedAt);
  assert.equal(calls, 2);
  clock += 18 * 60 * 60 * 1000;
  await assert.rejects(get());
  await assert.rejects(get());
  assert.equal(calls, 3);
  fail = false;
  clock += 60_001;
  assert.equal((await get()).stale, false);
});

test("冷启动错误不被伪装为空列表，可在退避后恢复", async () => {
  let clock = 1_000;
  let calls = 0;
  const get = createChargingStationCache(async () => {
    if (++calls === 1) throw new Error("暂时中断");
    return [station("一", 30, 120)];
  }, () => clock);
  await assert.rejects(get());
  await assert.rejects(get());
  assert.equal(calls, 1);
  clock += 60_001;
  assert.equal((await get()).stations.length, 1);
});

test("详情只按站点加载、合并并发请求，三十秒后刷新；失败不延用旧空闲桩数", async () => {
  let clock = 1_000;
  let calls = 0;
  let fail = false;
  const get = createTeslaStationDetailsCache(async (id) => {
    calls++;
    if (fail) throw new Error("详情不可用");
    return parseTeslaStationDetails(liveDetails, id);
  }, () => clock);
  await Promise.all([get("102302"), get("102302")]);
  assert.equal(calls, 1);
  clock += 29_000;
  await get("102302");
  assert.equal(calls, 1);
  clock += 1_000;
  fail = true;
  await assert.rejects(get("102302"));
  fail = false;
  const refreshed = await get("102302");
  assert.equal(calls, 3);
  assert.equal(refreshed.fetchedAt, new Date(clock).toISOString());
});
