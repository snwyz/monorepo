import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const context = vm.createContext({});
const modules = new Map();
function load(path) {
  if (modules.has(path)) return modules.get(path).exports;
  const module = { exports: {} };
  modules.set(path, module);
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInContext(`(function(require,module,exports){${source}\n})`, context)(
    (specifier) => load(resolve(dirname(path), `${specifier}.ts`)), module, module.exports,
  );
  return module.exports;
}
const { mergeRoadSections, getTencentRoadPath, selectRoadLabels, createRoadLabelVisual } = load(
  fileURLToPath(new URL("../src/route-road-label.ts", import.meta.url)),
);
const point = (longitude, latitude = 30) => ({ longitude, latitude });
const path = [point(110), point(110.005), point(110.01), point(110.015)];
const viewport = { center: point(110.01), zoom: 15, width: 1200, height: 720 };
const leg = { id: "outbound", path, roadSections: [{ name: "测试路", path }] };

test("腾讯下标按经纬度数组计算，结束点包含在内，不接受越界范围", () => {
  assert.deepEqual(getTencentRoadPath(path, [2, 7]), path.slice(1, 4));
  for (const range of [undefined, [-2, 3], [1, 3], [0, 8], [0, 6], [4, 3], [0.5, 3]]) {
    assert.equal(getTencentRoadPath(path, range).length, 0);
  }
});
test("只合并首尾相接的同名道路，缺名步骤打断合并且不修改输入", () => {
  const sections = [{ name: " 测试路 ", path: path.slice(0, 2) }, { name: "测试路", path: path.slice(1) }];
  assert.equal(mergeRoadSections(sections).length, 1);
  assert.equal(mergeRoadSections(sections)[0].path.length, 4);
  assert.equal(sections[0].path.length, 2);
  assert.equal(mergeRoadSections([sections[0], { name: [], path }, sections[1]]).length, 2);
  assert.equal(mergeRoadSections([{ name: "无名道路", path }]).length, 0);
});
test("重合的同名道路不重复叠字，旧结果、失败、缺少道路数据均不显示", () => {
  assert.equal(selectRoadLabels([leg, { ...leg, id: "return" }], [], viewport).length, 1);
  for (const route of [{ ...leg, stale: true }, { ...leg, failed: true }, { id: "old", path }]) {
    assert.equal(selectRoadLabels([route], [], viewport).length, 0);
  }
});
test("标签锚定真实曲线，短路与视野外道路不强行显示", () => {
  const labels = selectRoadLabels([leg], [], viewport);
  assert.equal(labels.length, 1);
  assert.equal(labels[0].coordinate.latitude, 30);
  assert.ok(labels[0].coordinate.longitude >= 110 && labels[0].coordinate.longitude <= 110.015);
  assert.equal(selectRoadLabels([leg], [], { ...viewport, zoom: 5 }).length, 0);
  assert.equal(selectRoadLabels([leg], [], { ...viewport, center: point(120) }).length, 0);
});
test("相交道路标签避让，选中路段优先", () => {
  const cross = { ...leg, id: "selected", selected: true, roadSections: [{ name: "选中道路", path }] };
  const labels = selectRoadLabels([leg, cross], [], viewport);
  assert.equal(labels[0].name, "选中道路");
});
test("路名转义，外部名称不能注入 SVG", () => {
  const source = decodeURIComponent(createRoadLabelVisual('<script>&"').source);
  assert.ok(source.includes('&lt;script&gt;&amp;&quot;'));
  assert.equal(source.includes('<script>'), false);
});

const screenPoint = (x, y) => point(110 + x / 10000, 30 - y / 10000);
const screenViewport = { ...viewport, project: (coordinate) => ({ x: (coordinate.longitude - 110) * 10000, y: (30 - coordinate.latitude) * 10000 }) };
const screenLeg = (pixels, name = "107省道") => {
  const coordinates = pixels.map(([x, y]) => screenPoint(x, y));
  return { id: "screen", path: coordinates, roadSections: [{ name, path: coordinates }] };
};

test("长道路重复显示固定字号路名，屏幕外中点不影响可见段标注", () => {
  const route = screenLeg([[-2000, 300], [2000, 300]]);
  const labels = selectRoadLabels([route], [], screenViewport);
  assert.ok(labels.length >= 3);
  assert.ok(labels.every((label) => label.angle === 0 && label.visual.height === 16));
  const reverse = { ...route, id: "return", isReturn: true, roadSections: [{ name: "107省道", path: [...route.path].reverse() }] };
  assert.equal(selectRoadLabels([route, reverse], [], screenViewport).length, labels.length);
  assert.equal(selectRoadLabels([route], [], { ...screenViewport, zoom: 13.99 }).length, 0);
});

test("沿斜线旋转并保持正向，反向路径不会倒置文字", () => {
  const route = screenLeg([[100, 100], [500, 500]]);
  for (const path of [route.path, [...route.path].reverse()]) {
    const labels = selectRoadLabels([{ ...route, roadSections: [{ name: "107省道", path }] }], [], screenViewport);
    assert.ok(labels.length > 0);
    assert.ok(labels.every((label) => Math.abs(label.angle - 45) < 0.001));
  }
});

test("文字不跨急弯，控制点和相交道路保留避让空间", () => {
  const corner = screenLeg([[100, 100], [240, 100], [240, 240]]);
  const cornerLabels = selectRoadLabels([corner], [], screenViewport);
  assert.ok(cornerLabels.every((label) => {
    const pixel = screenViewport.project(label.coordinate);
    return Math.hypot(pixel.x - 240, pixel.y - 100) >= label.visual.width / 2 + 8;
  }));
  const straight = screenLeg([[100, 100], [380, 100]]);
  const controlPoint = { ...screenPoint(240, 100), id: "point", name: "地点", order: 1 };
  assert.equal(selectRoadLabels([straight], [controlPoint], screenViewport).length, 0);
  const crossing = { ...screenLeg([[240, 0], [240, 280]], "交叉路"), id: "crossing", selected: true };
  const labels = selectRoadLabels([straight, crossing], [], screenViewport);
  assert.equal(labels.length, 1);
  assert.equal(labels[0].name, "交叉路");
});

test("平移保留重复标注相位，去程和返程各用自身内芯遮住箭头", () => {
  const route = screenLeg([[-2000, 300], [2000, 300]]);
  const first = selectRoadLabels([route], [], screenViewport);
  const moved = selectRoadLabels([route], [], { ...screenViewport, project: (coordinate) => {
    const pixel = screenViewport.project(coordinate);
    return { x: pixel.x + 40, y: pixel.y };
  } });
  const common = moved.filter((label) => first.some((other) => Math.abs(other.coordinate.longitude - label.coordinate.longitude) < 0.000001));
  assert.ok(common.length >= 2);
  const outboundSource = decodeURIComponent(createRoadLabelVisual("107省道").source);
  const returnSource = decodeURIComponent(createRoadLabelVisual("107省道", true).source);
  assert.ok(outboundSource.includes('#30d158'));
  assert.ok(returnSource.includes('#1297ff'));
  assert.equal(outboundSource.includes('<path'), false);
});

test("桌面和手机均限制可见标注数量，长名称保持固定宽度边界", () => {
  const routes = Array.from({ length: 100 }, (_, index) => ({
    ...screenLeg([[0, 20 + index * 20], [1200, 20 + index * 20]], `道路${index}`), id: String(index),
  }));
  assert.ok(selectRoadLabels(routes, [], screenViewport).length <= 32);
  assert.ok(selectRoadLabels(routes, [], { ...screenViewport, width: 390, height: 844 }).length <= 13);
  assert.equal(createRoadLabelVisual("超长道路名称需要省略并保持标注宽度").width, 192);
});

test("重合路线按实际绘制顺序选择颜色，不在更高路线下留下异色遮箭头底层", () => {
  const route = screenLeg([[100, 100], [900, 100]]);
  const returnLeg = { ...route, id: "return", isReturn: true };
  assert.ok(selectRoadLabels([route, returnLeg], [], screenViewport).every((label) => label.isReturn));
  assert.ok(selectRoadLabels([{ ...route, selected: true }, returnLeg], [], screenViewport).every((label) => !label.isReturn));
  const unnamedReturn = { ...returnLeg, roadSections: [] };
  assert.equal(selectRoadLabels([route, unnamedReturn], [], screenViewport).length, 0);
});

test("腾讯连续索引的同名步骤不共享端点也合并，保留连接两侧的全部坐标", () => {
  const sections = [
    { name: "青城山路", path: path.slice(0, 2) },
    { name: "青城山路", path: path.slice(2), connectsToPrevious: true },
  ];
  const merged = mergeRoadSections(sections);
  assert.equal(merged.length, 1);
  assert.deepEqual(Array.from(merged[0].path), path);
  assert.equal(sections[0].path.length, 2);
  assert.equal(mergeRoadSections([{ ...sections[0] }, { ...sections[1], connectsToPrevious: false }]).length, 2);
  assert.equal(mergeRoadSections([sections[0], { name: "", path }, sections[1]]).length, 2);
});
