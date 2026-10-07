import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const scriptModule = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { module: scriptModule, exports: scriptModule.exports, require: (specifier) => load(path.resolve(path.dirname(file), `${specifier}.ts`)) });
  modules.set(file, scriptModule.exports);
  return scriptModule.exports;
}
const directory = path.dirname(fileURLToPath(import.meta.url));
const { buildRouteElevationChartData } = load(path.join(directory, "route-elevation-chart-data.ts"));
const { buildRouteDistanceAxis, buildRouteElevationAxis, formatRouteDistanceTick } = load(path.join(directory, "route-elevation-chart-axis.ts"));
const { summarizeElevation } = load(path.resolve(directory, "../../domain/elevation-analysis/analyze.ts"));
const sample = (distanceMeters, height, quality = "surface-estimate") => ({ distanceMeters, elevationMeters: height, rawElevationMeters: height, quality, coordinate: { latitude: 30, longitude: 110 }, passageIndex: 0, legId: "AB", legDistanceMeters: distanceMeters });
function draw(samples) {
  const range = { startMeters: samples[0].distanceMeters, endMeters: samples[samples.length - 1].distanceMeters };
  return buildRouteElevationChartData(samples, range, [], summarizeElevation(samples, range));
}
test("缺失与低可信度高程进入Recharts时仍为空值，零和负海拔保留", () => {
  const samples = [sample(0, -10), sample(100, 0), sample(200, null, "missing"), sample(300, 20, "low-confidence"), sample(400, 30)];
  assert.deepEqual(Array.from(draw(samples), (point) => point.heightMeters), [-10, 0, null, null, 30]);
  assert.equal(samples[3].elevationMeters, 20);
});
test("相邻有效高程之间的道路断点和超长采样间隔保留供读数识别的空值", () => {
  for (const samples of [[sample(0, 100), { ...sample(100, 150), breakBefore: true }, sample(200, 200)], [sample(0, 100), sample(500, 200)]]) {
    const points = draw(samples);
    assert.equal(points[1].heightMeters, null);
    assert.equal(points[1].sample, null);
    assert.equal(points[2].heightMeters, samples[1].elevationMeters);
  }
});
test("绘图抽稀保留最高最低点且不修改完整分析样本", () => {
  const samples = Array.from({ length: 2001 }, (_, index) => sample(index * 100, index === 813 ? 1500 : index === 1301 ? -25 : 500));
  const points = draw(samples);
  assert.ok(points.length < samples.length);
  assert.ok(points.some((point) => point.distanceMeters === 81300 && point.heightMeters === 1500));
  assert.ok(points.some((point) => point.distanceMeters === 130100 && point.heightMeters === -25));
  assert.equal(samples.length, 2001);
});

test("带密集起伏和连续缺口的长路线保留断点与极值，绘图不修改统计样本", () => {
  const samples = Array.from({ length: 4001 }, (_, index) => sample(index * 100, index >= 1600 && index <= 2000 ? null : 500 + index * 0.1 + (index % 2 ? 8 : -8), index >= 1600 && index <= 2000 ? "missing" : "surface-estimate"));
  samples[1301] = sample(130100, 1700);
  samples[3001] = sample(300100, -30);
  const range = { startMeters: 0, endMeters: 400000 };
  const before = JSON.stringify(summarizeElevation(samples, range));
  const points = draw(samples);
  assert.ok(points.length < samples.length);
  assert.ok(points.some((point) => point.distanceMeters === 130100 && point.heightMeters === 1700));
  assert.ok(points.some((point) => point.distanceMeters === 300100 && point.heightMeters === -30));
  assert.ok(points.some((point) => point.distanceMeters === 159900 && point.heightMeters !== null));
  assert.ok(points.some((point) => point.distanceMeters === 200100 && point.heightMeters !== null));
  assert.ok(points.filter((point) => point.distanceMeters >= 160000 && point.distanceMeters <= 200000).every((point) => point.heightMeters === null));
  assert.equal(JSON.stringify(summarizeElevation(samples, range)), before);
});

test("500与1000公里分别使用20与50公里小刻度，数字标签不逐格堆叠", () => {
  const medium = buildRouteDistanceAxis({ startMeters: 0, endMeters: 500000 }, 240);
  const long = buildRouteDistanceAxis({ startMeters: 0, endMeters: 1000000 }, 240);
  assert.equal(medium.minorStepMeters, 20000);
  assert.equal(long.minorStepMeters, 50000);
  assert.deepEqual(Array.from(medium.labelTicks), [0, 100000, 200000, 300000, 400000, 500000]);
  assert.deepEqual(Array.from(long.labelTicks), [0, 250000, 500000, 750000, 1000000]);
});

test("非整里程与选中路段保留真实范围及全程累计口径", () => {
  const range = { startMeters: 0, endMeters: 165300 };
  const axis = buildRouteDistanceAxis(range, 240);
  assert.deepEqual(Array.from(axis.labelTicks), [0, 50000, 100000, 150000]);
  assert.equal(range.endMeters, 165300);
  const leg = buildRouteDistanceAxis({ startMeters: 437200, endMeters: 443500 }, 240);
  assert.ok(leg.labelTicks.length >= 2);
  assert.ok(leg.labelTicks.every((tick) => tick >= 437200 && tick <= 443500));
  assert.equal(formatRouteDistanceTick(440000, leg.labelStepMeters), "440");
});

test("短路线小数可辨且窄面板不会增加标签，异常范围不生成刻度", () => {
  for (const distance of [500, 6300, 99999, 500000, 1000000]) {
    const wide = buildRouteDistanceAxis({ startMeters: 0, endMeters: distance }, 240);
    const narrow = buildRouteDistanceAxis({ startMeters: 0, endMeters: distance }, 100);
    assert.ok(wide.minorTicks.length <= 26);
    assert.ok(wide.labelTicks.length <= 6);
    assert.ok(narrow.labelTicks.length <= 3);
    assert.ok(narrow.labelStepMeters >= wide.labelStepMeters);
    const labels = wide.labelTicks.map((tick) => formatRouteDistanceTick(tick, wide.labelStepMeters));
    assert.equal(new Set(labels).size, labels.length);
  }
  assert.equal(formatRouteDistanceTick(100, 100), "0.1");
  for (const endMeters of [0, -10, NaN, Infinity]) {
    assert.equal(buildRouteDistanceAxis({ startMeters: 0, endMeters }, 240).minorTicks.length, 0);
  }
});

test("海拔刻度覆盖极值并预留空间，平坦与负海拔不用零作为下限", () => {
  for (const [lowest, highest] of [[711, 4719], [-80, 300], [500, 500], [-100, -100]]) {
    const axis = buildRouteElevationAxis(lowest, highest);
    assert.ok(axis.domain[0] < lowest);
    assert.ok(axis.domain[1] > highest);
    assert.ok(axis.ticks.length >= 2 && axis.ticks.length <= 4);
    assert.equal(axis.ticks[0], axis.domain[0]);
    assert.equal(axis.ticks[axis.ticks.length - 1], axis.domain[1]);
  }
  assert.ok(buildRouteElevationAxis(500, 500).domain[0] > 0);
  assert.ok(buildRouteElevationAxis(-100, -100).domain[1] < 0);
});
