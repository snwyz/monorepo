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
test("普通与返程同名路只标一次，旧结果、失败、缺少道路数据均不显示", () => {
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
