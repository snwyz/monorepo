import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const loaded = new Map();
function load(relative) {
  const file = fileURLToPath(new URL(relative, import.meta.url));
  if (loaded.has(file)) return loaded.get(file);
  const scriptModule = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, "utf8").replaceAll("import.meta.url", JSON.stringify(new URL(relative, import.meta.url).href)), { compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { module: scriptModule, exports: scriptModule.exports, require: (specifier) => {
    if (specifier.startsWith(".")) return load(path.relative(path.dirname(fileURLToPath(import.meta.url)), path.resolve(path.dirname(file), `${specifier}.ts`)));
    throw new Error(`未预期依赖：${specifier}`);
  }, Date, setTimeout, AbortSignal, Error });
  loaded.set(file, scriptModule.exports);
  return scriptModule.exports;
}
const { ELEVATION_SOURCE } = load("./model.ts");
const { analyzeElevation, summarizeElevation, sectionsInRange, simplifyChartSamples, sampleAt } = load("./analyze.ts");
const { buildElevationGeometry, sliceElevationPaths } = load("./geometry.ts");
const { wgs84ToGcj02, gcj02ToWgs84 } = load("../../infrastructure/elevation-analysis/coordinate-transform.ts");
const { parseElevationBatch } = load("../../infrastructure/elevation-analysis/open-topo-service.ts");
const { loadElevationProfile } = load("../../infrastructure/elevation-analysis/profile-cache.ts");
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} 与 ${expected} 的差超出 ${tolerance}`);
function synthetic(height, end = 200000, spacing = 100) {
  return Array.from({ length: end / spacing + 1 }, (_, index) => {
    const distanceMeters = index * spacing; const rawElevationMeters = height(distanceMeters);
    return { distanceMeters, legDistanceMeters: distanceMeters, legId: distanceMeters <= 35000 ? "AB" : "BC", passageIndex: distanceMeters <= 35000 ? 0 : 1, coordinate: { latitude: 30, longitude: 110 + distanceMeters / 100000 }, rawElevationMeters, elevationMeters: rawElevationMeters, quality: rawElevationMeters === null ? "missing" : "surface-estimate" };
  });
}
const mountain = (d) => d < 20000 ? 500 : d < 55000 ? 500 + (d - 20000) * .03 : d < 90000 ? 1550 - (d - 55000) * .03 : 500;
test("200公里同海拔路线识别两段35公里长坡，跨控制点连续", () => {
  const profile = analyzeElevation(synthetic(mountain));
  const summary = summarizeElevation(profile.samples, { startMeters: 0, endMeters: 200000 });
  near(summary.ascentMeters, 1050); near(summary.descentMeters, 1050); near(summary.netHeightMeters, 0); near(summary.coverage, 1);
  assert.equal(profile.sections.length, 2);
  const [up, down] = profile.sections;
  near(up.startMeters, 20000); near(up.endMeters, 55000); near(up.lengthMeters, 35000); near(up.averageGradePercent, 3); near(up.localGrade.percent, 3); near(up.trendGrade.percent, 3);
  near(down.startMeters, 55000); near(down.endMeters, 90000); near(down.averageGradePercent, -3);
});
test("控制点、任意区间与非采样边界重新裁剪统计", () => {
  const profile = analyzeElevation(synthetic(mountain));
  const ab = sectionsInRange(profile, { startMeters: 0, endMeters: 35000 });
  near(ab[0].lengthMeters, 15000); near(ab[0].netHeightMeters, 450);
  const arbitrary = sectionsInRange(profile, { startMeters: 30000, endMeters: 45000 });
  near(arbitrary[0].lengthMeters, 15000); near(arbitrary[0].netHeightMeters, 450); near(arbitrary[0].averageGradePercent, 3);
  const summary = summarizeElevation(profile.samples, { startMeters: 30000, endMeters: 70000 });
  near(summary.ascentMeters, 750); near(summary.descentMeters, 450); near(summary.netHeightMeters, 300);
  const interpolated = summarizeElevation(profile.samples, { startMeters: 30025, endMeters: 45075 });
  near(interpolated.netHeightMeters, 451.5);
});
test("反向顺序按实际剖面变化；50米与100米采样对照保持合成坡段", () => {
  const reversed = analyzeElevation(synthetic((d) => 1000 - mountain(d)));
  assert.equal(reversed.sections[0].direction, "descent"); assert.equal(reversed.sections[1].direction, "ascent");
  const dense = analyzeElevation(synthetic(mountain, 200000, 50));
  near(dense.sections[0].lengthMeters, 35000); near(summarizeElevation(dense.samples, { startMeters: 0, endMeters: 200000 }).ascentMeters, 1050);
});
test("固定种子平原噪声不累加每次抖动，也不误报重点长坡", () => {
  let seed = 17;
  const raw = synthetic(() => { seed = (seed * 1664525 + 1013904223) >>> 0; return 100 + (seed / 4294967296 - .5) * 4; });
  const profile = analyzeElevation(raw);
  assert.equal(profile.sections.length, 0);
  const summary = summarizeElevation(profile.samples, { startMeters: 0, endMeters: 200000 });
  assert.ok(summary.ascentMeters + summary.descentMeters < 5);
});
test("缺失/低可信度断开统计与持续坡段，零米与负海拔有效", () => {
  const raw = synthetic((d) => d >= 40000 && d <= 60000 ? null : mountain(d));
  const profile = analyzeElevation(raw);
  const summary = summarizeElevation(profile.samples, { startMeters: 0, endMeters: 200000 });
  assert.ok(summary.coverage < .9); assert.ok(profile.sections.every((section) => section.endMeters < 40000 || section.startMeters > 60000));
  assert.equal(sampleAt(profile.samples, 39950).quality, "missing");
  const uncertain = synthetic((d) => d * .02, 10000);
  uncertain[50].quality = "low-confidence";
  const uncertainProfile = analyzeElevation(uncertain);
  assert.equal(uncertainProfile.sections.length, 0);
  const belowSea = analyzeElevation(synthetic((d) => -100 + d * .01, 10000));
  const result = summarizeElevation(belowSea.samples, { startMeters: 0, endMeters: 10000 });
  near(result.lowest.elevationMeters, -100); near(result.highest.elevationMeters, 0); near(result.netHeightMeters, 100);
});
test("短平路允许有界合并，长平路和明显反向坡结束长坡", () => {
  const profile = analyzeElevation(synthetic((d) => d < 6000 ? d * .03 : d < 6400 ? 180 : 180 + (d - 6400) * .03, 14000));
  assert.equal(profile.sections.length, 1);
  const separated = analyzeElevation(synthetic((d) => d < 6000 ? d * .03 : d < 8000 ? 180 : 180 + (d - 8000) * .03, 14000));
  assert.equal(separated.sections.length, 2);
});
test("折线测距不拉伸，返程同坐标以不同累计位置与经过序号保留", () => {
  const a = { latitude: 30, longitude: 110 }; const b = { latitude: 30.1, longitude: 110.2 }; const c = { latitude: 30.2, longitude: 110 };
  const route = { scope: "round-trip", distanceMeters: 999999, legs: [{ id: "out", fromControlPointId: "a", toControlPointId: "c", path: [a, b, c] }, { id: "return", fromControlPointId: "c", toControlPointId: "a", path: [c, b, a] }] };
  const geometry = buildElevationGeometry(route, new Map([["a", "A"], ["c", "C"]]));
  assert.ok(geometry.distanceMeters < route.distanceMeters); assert.equal(geometry.controlPoints[2].name, "返回起点");
  const occurrences = geometry.vertices.filter((vertex) => vertex.coordinate === b);
  assert.equal(occurrences.length, 2); assert.ok(occurrences[1].distanceMeters > occurrences[0].distanceMeters); assert.notEqual(occurrences[0].passageIndex, occurrences[1].passageIndex);
  const paths = sliceElevationPaths(geometry, geometry.controlPoints[1].distanceMeters, geometry.distanceMeters);
  assert.equal(paths.length, 1); near(paths[0][0].latitude, c.latitude); near(paths[0][paths[0].length - 1].latitude, a.latitude);
  assert.notEqual(geometry.signature, buildElevationGeometry({ ...route, legs: route.legs.slice().reverse() }, new Map()).signature);
});
test("1000公里密集道路折线保留全部几何，不触发一次性参数展开上限", () => {
  const path = Array.from({ length: 130001 }, (_, index) => ({ latitude: 20 + index * .00007, longitude: 110 }));
  const geometry = buildElevationGeometry({ scope: "one-way", distanceMeters: 1000000, legs: [{ id: "dense", fromControlPointId: "a", toControlPointId: "b", path }] }, new Map());
  assert.equal(geometry.vertices.length, path.length); assert.ok(geometry.distanceMeters > 1000000); assert.ok(geometry.samples.length > 10000 && geometry.samples.length < 11000);
  near(geometry.samples[geometry.samples.length - 1].coordinate.latitude, path[path.length - 1].latitude);
});
test("绘图抽稀保留坡段边界、峰值、控制点与质量断点，不改变统计输入", () => {
  const profile = analyzeElevation(synthetic((d) => d === 120000 ? null : mountain(d)));
  const drawn = simplifyChartSamples(profile.samples, [35000, 55000]);
  assert.ok(drawn.length < profile.samples.length); assert.ok(drawn.some((s) => s.distanceMeters === 35000)); assert.ok(drawn.some((s) => s.distanceMeters === 55000)); assert.ok(drawn.some((s) => s.quality === "missing")); assert.equal(profile.samples.length, 2001);
});
test("异常跳高与不连续道路边界不平滑成确定路面", () => {
  const raw = synthetic((d) => d === 5000 ? 4000 : d * .02, 10000);
  const profile = analyzeElevation(raw);
  assert.equal(profile.samples[50].quality, "low-confidence");
  assert.equal(profile.sections.length, 0);
  const broken = synthetic((d) => d * .03, 15000);
  broken[75].breakBefore = true;
  const brokenProfile = analyzeElevation(broken);
  assert.equal(brokenProfile.sections.length, 2);
  near(brokenProfile.sections[0].endMeters, 7400); near(brokenProfile.sections[1].startMeters, 7500);
});
test("坐标转换校验已知北京参考点与境外不变，并保留查询/地图对应", () => {
  const wgs = { latitude: 39.908823, longitude: 116.397470 };
  const gcj = wgs84ToGcj02(wgs);
  near(gcj.latitude, 39.9102265, .000001); near(gcj.longitude, 116.4037136, .000001);
  const back = gcj02ToWgs84(gcj); near(back.latitude, wgs.latitude, 1e-7); near(back.longitude, wgs.longitude, 1e-7);
  const foreign = { latitude: -33, longitude: 151 }; near(gcj02ToWgs84(foreign).longitude, 151);
});
test("高程批次归一化保留零、负值与空值，拒绝乱序/串来源/数量异常", () => {
  const coordinates = [{ latitude: 30, longitude: 110 }, { latitude: 31, longitude: 110 }, { latitude: 32, longitude: 110 }];
  const payload = { status: "OK", results: coordinates.map((point, index) => ({ elevation: [0, -50, null][index], dataset: "srtm30m", location: { lat: point.latitude, lng: point.longitude } })) };
  const result = parseElevationBatch(payload, coordinates);
  assert.equal(result.elevations[0], 0); assert.equal(result.elevations[1], -50); assert.equal(result.elevations[2], null);
  assert.throws(() => parseElevationBatch({ ...payload, results: payload.results.slice().reverse() }, coordinates));
  assert.throws(() => parseElevationBatch({ ...payload, results: [] }, coordinates));
  for (const invalid of [null, { ...payload.results[0], dataset: "other" }, { ...payload.results[0], location: { lat: "30", lng: 110 } }, { ...payload.results[0], location: { lat: NaN, lng: 110 } }]) {
    assert.throws(() => parseElevationBatch({ ...payload, results: [invalid, ...payload.results.slice(1)] }, coordinates));
  }
});
test("稳定几何原始/分析缓存复用，选区无需查询；取消后不再发后续批次", async () => {
  const geometry = buildElevationGeometry({ scope: "one-way", distanceMeters: 22000, legs: [{ id: "cache", fromControlPointId: "a", toControlPointId: "b", path: [{ latitude: 30, longitude: 110 }, { latitude: 30.2, longitude: 110 }] }] }, new Map());
  let calls = 0;
  const provider = { async query(coordinates) { calls++; return { elevations: coordinates.map((_, index) => 100 + index), sourceVersion: ELEVATION_SOURCE.version }; } };
  const first = await loadElevationProfile(geometry, provider, new AbortController().signal, () => {});
  const batchCalls = calls;
  const cached = await loadElevationProfile(geometry, provider, new AbortController().signal, () => {});
  assert.equal(calls, batchCalls); assert.equal(cached.profile, first.profile);
  sectionsInRange(cached.profile, { startMeters: 5000, endMeters: 10000 }); assert.equal(calls, batchCalls);
  const controller = new AbortController(); let cancelledCalls = 0;
  await assert.rejects(loadElevationProfile(geometry, { async query(coordinates) { cancelledCalls++; controller.abort(); return { elevations: coordinates.map(() => 0), sourceVersion: ELEVATION_SOURCE.version }; } }, controller.signal, () => {}, true));
  assert.equal(cancelledCalls, 1);
});
test("部分批次失败保留已覆盖数据，全部失败独立报错", async () => {
  const geometry = buildElevationGeometry({ scope: "one-way", distanceMeters: 22000, legs: [{ id: "partial", fromControlPointId: "a", toControlPointId: "b", path: [{ latitude: 31, longitude: 110 }, { latitude: 31.2, longitude: 110 }] }] }, new Map());
  let calls = 0;
  const result = await loadElevationProfile(geometry, { async query(coordinates) { if (++calls > 1) throw new Error("服务超时"); return { elevations: coordinates.map(() => 0), sourceVersion: ELEVATION_SOURCE.version }; } }, new AbortController().signal, () => {});
  assert.equal(result.warning, "服务超时"); assert.ok(result.profile.samples.some((s) => s.quality === "missing"));
  await assert.rejects(loadElevationProfile(geometry, { query() { throw new Error("服务离线"); } }, new AbortController().signal, () => {}, true), /服务离线/);
});
test("200公里及1000公里样例记录领域处理成本", () => {
  for (const length of [200000, 1000000]) {
    const raw = synthetic((d) => 500 + Math.sin(d / 20000) * 800, length);
    const start = performance.now(); const profile = analyzeElevation(raw); const analysisMs = performance.now() - start;
    const selectionStart = performance.now(); const clipped = sectionsInRange(profile, { startMeters: 30000, endMeters: 70000 }); const summary = summarizeElevation(profile.samples, { startMeters: 30000, endMeters: 70000 }); const selectionMs = performance.now() - selectionStart;
    console.log(JSON.stringify({ routeKm: length / 1000, samples: raw.length, analysisMs: Math.round(analysisMs * 100) / 100, cachedSelectionMs: Math.round(selectionMs * 100) / 100, sections: clipped.length, coverage: summary.coverage }));
    assert.ok(analysisMs < 2000); assert.ok(selectionMs < 250);
  }
});
