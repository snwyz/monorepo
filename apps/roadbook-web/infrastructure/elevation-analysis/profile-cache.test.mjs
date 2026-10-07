import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

function setup() {
  let now = 1000;
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const scriptModule = { exports: {} };
    const source = ts.transpileModule(readFileSync(file, "utf8").replaceAll("import.meta.url", JSON.stringify(pathToFileURL(file).href)), { compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(source, { module: scriptModule, exports: scriptModule.exports, require: (specifier) => load(path.resolve(path.dirname(file), `${specifier}.ts`)), Date: { now: () => now }, AbortSignal, Error, URL, setTimeout, clearTimeout });
    modules.set(file, scriptModule.exports);
    return scriptModule.exports;
  }
  const directory = path.dirname(fileURLToPath(import.meta.url));
  return { ...load(path.join(directory, "profile-cache.ts")), ...load(path.resolve(directory, "../../domain/elevation-analysis/geometry.ts")), sourceVersion: load(path.resolve(directory, "../../domain/elevation-analysis/model.ts")).ELEVATION_SOURCE.version, advance(milliseconds) { now += milliseconds; } };
}
const signal = () => new AbortController().signal;
const key = (point) => `${point.latitude},${point.longitude}`;
const sample = (index) => ({ distanceMeters: index * 100, legDistanceMeters: index * 100, legId: "outbound", passageIndex: 0, coordinate: { latitude: 30, longitude: 110 + index / 10000 }, rawElevationMeters: null, elevationMeters: null, quality: "missing" });
const geometry = (signature, samples) => ({ signature, samplingVersion: "test-v1", sampleSpacingMeters: 100, samples, vertices: samples, controlPoints: [], distanceMeters: samples[samples.length - 1].distanceMeters, providerDistanceMeters: samples[samples.length - 1].distanceMeters });
const loadProfile = (fixture, route, provider, progress = () => {}, force = false) => fixture.loadElevationProfile(route, provider, signal(), progress, force);

test("真实单程扩为往返时只请求新增坐标，再次切换复用完整分析", async () => {
  const fixture = setup(); const requests = [];
  const provider = { async query(coordinates) { requests.push(coordinates.map(key)); return { elevations: coordinates.map((point) => 500 + (point.latitude - 30) * 1000), sourceVersion: fixture.sourceVersion }; } };
  const a = { latitude: 30, longitude: 110 }; const b = { latitude: 30.01, longitude: 110 };
  const outbound = { id: "a:b", fromControlPointId: "a", toControlPointId: "b", path: [a, b] };
  const go = fixture.buildElevationGeometry({ scope: "one-way", distanceMeters: 1100, legs: [outbound] }, new Map());
  const both = fixture.buildElevationGeometry({ scope: "round-trip", distanceMeters: 2500, legs: [outbound, { id: "b:a", fromControlPointId: "b", toControlPointId: "a", path: [b, { latitude: 30.005, longitude: 110.003 }, a] }] }, new Map());
  const first = await loadProfile(fixture, go, provider);
  const known = new Set(requests.flat()); const progress = [];
  const second = await loadProfile(fixture, both, provider, (completed, total) => progress.push([completed, total]));
  assert.ok(requests[1].length > 0);
  assert.ok(requests[1].every((coordinate) => !known.has(coordinate)));
  assert.deepEqual(Array.from(second.profile.rawSamples.slice(0, go.samples.length), (point) => point.rawElevationMeters), Array.from(first.profile.rawSamples, (point) => point.rawElevationMeters));
  assert.equal(second.profile.samples.length, both.samples.length);
  assert.deepEqual(progress, [[0, 1], [1, 1]]);
  assert.equal(fixture.getCachedElevationProfile(go, provider), first.profile);
  assert.equal((await loadProfile(fixture, both, provider)).profile, second.profile);
  assert.equal(requests.length, 2);
});

test("原路反向的相同采样坐标不再查询，但经过顺序与上下坡分别分析", async () => {
  const fixture = setup(); let calls = 0;
  const points = Array.from({ length: 101 }, (_, index) => sample(index));
  const provider = { async query(coordinates) { calls++; return { elevations: coordinates.map((point) => 500 + (point.longitude - 110) * 20000), sourceVersion: fixture.sourceVersion }; } };
  await loadProfile(fixture, geometry("go", points), provider);
  const returns = points.slice(0, -1).reverse().map((point, index) => ({ ...point, distanceMeters: 10100 + index * 100, legDistanceMeters: (index + 1) * 100, legId: "return", passageIndex: 1 }));
  const progress = [];
  const result = await loadProfile(fixture, geometry("both", [...points, ...returns]), provider, (completed, total) => progress.push([completed, total]));
  assert.equal(calls, 2); // 单程101个独立坐标分两批，返程不增加请求。
  assert.deepEqual(progress, [[0, 0]]);
  assert.equal(result.profile.rawSamples.length, 201);
  assert.equal(result.profile.rawSamples[101].legId, "return");
  assert.equal(result.profile.rawSamples[101].passageIndex, 1);
  assert.equal(result.profile.rawSamples[101].distanceMeters, 10100);
  assert.ok(result.profile.sections.some((section) => section.direction === "ascent"));
  assert.ok(result.profile.sections.some((section) => section.direction === "descent"));
  assert.equal(result.profile.rawSamples[200].rawElevationMeters, result.profile.rawSamples[0].rawElevationMeters);
  assert.equal(points[0].rawElevationMeters, null);
});

test("重复经过只查询一次坐标，零米、负海拔与缺失读数不混淆", async () => {
  const fixture = setup(); const requests = [];
  const points = [sample(0), sample(1), sample(2), { ...sample(3), coordinate: sample(0).coordinate }];
  const provider = { async query(coordinates) { requests.push(coordinates); return { elevations: [0, -10, null], sourceVersion: fixture.sourceVersion }; } };
  const result = await loadProfile(fixture, geometry("repeated", points), provider);
  assert.equal(requests[0].length, 3);
  assert.deepEqual(Array.from(result.profile.rawSamples, (point) => point.rawElevationMeters), [0, -10, null, 0]);
  assert.equal(result.profile.rawSamples[2].quality, "missing");
});

test("部分失败后保留成功批次，恢复时只补失败坐标；主动重试绕过缓存", async () => {
  const fixture = setup(); const requests = []; let fail = true;
  const route = geometry("partial", Array.from({ length: 201 }, (_, index) => sample(index)));
  const provider = { async query(coordinates) { requests.push(coordinates.map(key)); if (fail && requests.length === 2) throw new Error("服务超时"); return { elevations: coordinates.map(() => 500), sourceVersion: fixture.sourceVersion }; } };
  const partial = await loadProfile(fixture, route, provider);
  assert.equal(partial.warning, "服务超时");
  assert.equal(fixture.getCachedElevationProfile(route, provider), null);
  fail = false; const progress = [];
  const recovered = await loadProfile(fixture, route, provider, (completed, total) => progress.push([completed, total]));
  assert.equal(recovered.warning, null);
  const successful = new Set(requests[0]);
  assert.ok(requests.slice(2).flat().every((coordinate) => !successful.has(coordinate)));
  assert.deepEqual(progress, [[0, 2], [1, 2], [2, 2]]);
  const beforeForce = requests.length;
  await loadProfile(fixture, route, provider, () => {}, true);
  assert.equal(requests.length - beforeForce, 3);
});

test("已取消的迟到批次不能写入缓存，不同来源实例不能共享读数", async () => {
  const fixture = setup(); const route = geometry("isolation", [sample(0), sample(1)]);
  const controller = new AbortController(); let calls = 0;
  const provider = { async query(coordinates) { if (++calls === 1) controller.abort(); return { elevations: coordinates.map(() => 100), sourceVersion: fixture.sourceVersion }; } };
  await assert.rejects(fixture.loadElevationProfile(route, provider, controller.signal, () => {}));
  assert.equal(fixture.getCachedElevationProfile(route, provider), null);
  await loadProfile(fixture, route, provider); assert.equal(calls, 2);
  let otherCalls = 0;
  const other = { async query(coordinates) { otherCalls++; return { elevations: coordinates.map(() => 200), sourceVersion: fixture.sourceVersion }; } };
  const result = await loadProfile(fixture, route, other);
  assert.equal(otherCalls, 1); assert.equal(result.profile.rawSamples[0].rawElevationMeters, 200);
});

test("复用旧读数不会续期，过期后只补过期点", async () => {
  const fixture = setup(); const requests = [];
  const provider = { async query(coordinates) { requests.push(coordinates.map(key)); return { elevations: coordinates.map(() => 500), sourceVersion: fixture.sourceVersion }; } };
  await loadProfile(fixture, geometry("old", [sample(0), sample(1)]), provider);
  fixture.advance(6 * 60 * 60 * 1000 - 1);
  const combined = geometry("combined", [sample(0), sample(1), sample(2)]);
  await loadProfile(fixture, combined, provider);
  assert.deepEqual(Array.from(requests[1]), [key(sample(2).coordinate)]);
  fixture.advance(2);
  assert.equal(fixture.getCachedElevationProfile(combined, provider), null);
  await loadProfile(fixture, combined, provider);
  assert.deepEqual(Array.from(requests[2]), [key(sample(0).coordinate), key(sample(1).coordinate)]);
});

test("来源版本不符或无效读数不能污染坐标缓存", async () => {
  for (const invalid of [{ sourceVersion: "other", elevations: [10, 20] }, { sourceVersion: null, elevations: [10, NaN] }, { sourceVersion: null, elevations: [10] }]) {
    const fixture = setup(); let calls = 0;
    const route = geometry("invalid", [sample(0), sample(1)]);
    const provider = { async query(coordinates) { if (++calls === 1) return { ...invalid, sourceVersion: invalid.sourceVersion ?? fixture.sourceVersion }; return { elevations: coordinates.map(() => 500), sourceVersion: fixture.sourceVersion }; } };
    await assert.rejects(loadProfile(fixture, route, provider));
    const result = await loadProfile(fixture, route, provider);
    assert.equal(calls, 2); assert.equal(result.profile.rawSamples[0].rawElevationMeters, 500);
  }
});
