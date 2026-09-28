// 只编译本次领域与请求模块，在内存中验证，不依赖地图 SDK 或真实供应商。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`;
const mergeUrl = moduleUrl(await readFile(new URL('../domain/route-charging/merge-route-charging-stations.ts', import.meta.url), 'utf8'));
const { mergeRouteChargingStations } = await import(mergeUrl);
const source = (await readFile(new URL('../infrastructure/route-charging/route-charging-client.ts', import.meta.url), 'utf8')).replace('@/domain/route-charging/merge-route-charging-stations', mergeUrl);
const clientUrl = moduleUrl(source);
const result = (stations = []) => ({ source: 'tesla', fetchedAt: new Date().toISOString(), radiusMeters: 2000, stale: false, stations });
const station = (id, distance) => ({ id, distanceFromRouteMeters: distance, distanceAlongRouteMeters: 100 });

test('全程去重、最近路段插入与返程锚点', () => {
  const merged = mergeRouteChargingStations([
    { fromControlPointId: 'a', toControlPointId: 'b', result: result([station('shared', 100), station('outbound', 50)]) },
    { fromControlPointId: 'b', toControlPointId: 'a', result: result([station('shared', 20), station('return', 10)]) },
  ]);
  assert.equal(merged.stations.length, 3);
  assert.equal(merged.stations.find(s => s.id === 'shared').fromControlPointId, 'b');
  assert.equal(merged.stations.find(s => s.id === 'return').toControlPointId, 'a');
});

test('重叠道路等距时选择首次经过，不丢失缓存标记', () => {
  const merged = mergeRouteChargingStations([
    { fromControlPointId: 'a', toControlPointId: 'b', result: result([station('same', 10)]) },
    { fromControlPointId: 'b', toControlPointId: 'a', result: { ...result([station('same', 10)]), stale: true } },
  ]);
  assert.equal(merged.stations[0].fromControlPointId, 'a');
  assert.equal(merged.stale, true);
});

test('空路线返回空站点集合', () => assert.equal(mergeRouteChargingStations([]).stations.length, 0));

test('请求缓存、并发合并、取消订阅、刷新与失败重试', async (t) => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  let fail = false;
  globalThis.fetch = async (url) => {
    requests++;
    await new Promise(resolve => setTimeout(resolve, 5));
    if (fail) return { ok: false, json: async () => ({ message: '测试失败' }) };
    return { ok: true, json: async () => url.endsWith('/tesla') ? result() : ({ stationId: url.split('/').pop(), fetchedAt: new Date().toISOString(), details: { availableStalls: 3 } }) };
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const client = await import(clientUrl);
  const path = [{ latitude: 30, longitude: 104 }, { latitude: 30.1, longitude: 104.1 }];
  const cancelled = new AbortController();
  const first = client.queryRouteChargingStations(path, cancelled.signal);
  const second = client.queryRouteChargingStations(path, new AbortController().signal);
  cancelled.abort();
  await assert.rejects(first);
  await second;
  await client.queryRouteChargingStations(path, new AbortController().signal);
  assert.equal(requests, 1, '关闭图层不破坏共享请求，重新打开不再请求');
  await Promise.all([1, 2].map(() => client.queryChargingStationDetails('detail', new AbortController().signal)));
  await client.queryChargingStationDetails('detail', new AbortController().signal);
  assert.equal(requests, 2, '连续点击详情只请求一次');
  assert.equal(client.getCachedChargingStationDetails('detail').details.availableStalls, 3);
  await client.queryChargingStationDetails('detail', new AbortController().signal, true);
  assert.equal(requests, 3, '手动刷新发起新请求');
  fail = true;
  await assert.rejects(client.queryChargingStationDetails('failed', new AbortController().signal));
  fail = false;
  await client.queryChargingStationDetails('failed', new AbortController().signal);
  assert.equal(requests, 5, '失败不缓存且允许重试');
});

test('全程批次不超过三个并发，覆盖所有路段', async (t) => {
  const originalFetch = globalThis.fetch;
  let active = 0, peak = 0, requests = 0;
  globalThis.fetch = async () => {
    requests++; active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5)); active--;
    return { ok: true, json: async () => result() };
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const client = await import(clientUrl);
  const legs = Array.from({ length: 7 }, (_, index) => ({ fromControlPointId: String(index), toControlPointId: String((index + 1) % 7), path: [{ latitude: 30, longitude: 104 }, { latitude: 30.1, longitude: 104.1 }] }));
  await client.queryWholeRouteChargingStations(legs, new AbortController().signal);
  assert.equal(requests, 7); assert.equal(peak, 3);
});
