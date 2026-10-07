import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

let fixtureSequence = 0;
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve, 1)); };
function setup() {
  const fixtureId = ++fixtureSequence;
  const slots = []; const requests = [];
  let cursor = 0; let scheduled = false; let disposed = false; let result;
  const context = { route: null, points: [], planId: `plan:${fixtureId}`, revision: 0, mapProvider: "amap" };
  let enabled = false; let legId = null;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const schedule = () => { if (!scheduled && !disposed) { scheduled = true; queueMicrotask(() => { scheduled = false; if (!disposed) render(); }); } };
  const memo = (factory, deps) => { const index = cursor++; if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: factory(), deps }; return slots[index].value; };
  const react = {
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === "function" ? initial() : initial }; return [slots[index].value, (next) => { const value = typeof next === "function" ? next(slots[index].value) : next; if (!Object.is(value, slots[index].value)) { slots[index].value = value; schedule(); } }]; },
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps), useRef: (initial) => memo(() => ({ current: initial }), []),
    useEffect(effect, deps) { const index = cursor++; const previous = slots[index]; if (!previous || !same(previous.deps, deps)) slots[index] = { effect, deps, cleanup: previous?.cleanup, pending: true }; },
  };
  const modules = new Map();
  const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const scriptModule = { exports: {} };
    const source = ts.transpileModule(readFileSync(file, "utf8").replaceAll("import.meta.url", JSON.stringify(pathToFileURL(file).href)), { compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(source, { module: scriptModule, exports: scriptModule.exports, require: (specifier) => {
      if (specifier === "react") return react;
      if (specifier.startsWith("@/")) return load(resolve(root, `${specifier.slice(2)}.ts`));
      if (specifier.startsWith(".")) return load(resolve(dirname(file), `${specifier}.ts`));
      throw new Error(`未预期依赖：${specifier}`);
    }, queueMicrotask, setTimeout, clearTimeout, AbortController, AbortSignal, URL, Date, Error });
    modules.set(file, scriptModule.exports); return scriptModule.exports;
  }
  // 测试调度器以受控React槽位执行真实Hook，不渲染组件。
  const { useRouteElevationAnalysis: analyzeHook } = load(fileURLToPath(new URL("./use-route-elevation-analysis.ts", import.meta.url)));
  const { ELEVATION_SOURCE } = load(resolve(root, "domain/elevation-analysis/model.ts"));
  const provider = { query(coordinates, signal) { return new Promise((resolve, reject) => requests.push({ coordinates, signal, reject, release: (height) => resolve({ elevations: coordinates.map(() => height), sourceVersion: ELEVATION_SOURCE.version }) })); } };
  function render() { cursor = 0; result = analyzeHook(context, enabled, legId, provider); for (const slot of slots) if (slot?.pending) { slot.pending = false; slot.cleanup?.(); slot.cleanup = slot.effect(); } }
  const route = (suffix) => ({ scope: "one-way", distanceMeters: 300, legs: [{ id: `leg:${fixtureId}:${suffix}`, fromControlPointId: "a", toControlPointId: "b", path: [{ latitude: 30, longitude: 110 }, { latitude: 30.003, longitude: 110 }] }] });
  render();
  return { context, requests, route, get value() { return result; }, render, setEnabled(value) { enabled = value; render(); }, setLegId(value) { legId = value; render(); }, dispose() { disposed = true; for (const slot of slots) slot?.cleanup?.(); } };
}
test("未展开与H5隐藏时不查询，打开有效路线才请求，范围切换和再次展开复用缓存", async () => {
  const fixture = setup(); fixture.context.route = fixture.route("initial"); fixture.render();
  await settle(); assert.equal(fixture.requests.length, 0);
  fixture.setEnabled(true); await settle(); assert.equal(fixture.requests.length, 1);
  fixture.requests[0].release(500); await settle(); assert.equal(fixture.value.state.status, "ready");
  assert.equal(fixture.value.setRange({ startMeters: 25, endMeters: 250 }), true); await settle(); assert.equal(fixture.requests.length, 1);
  fixture.setEnabled(false); fixture.setEnabled(true); await settle(); assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.value.setRange({ startMeters: 250, endMeters: 100 }), false);
  fixture.dispose();
});
test("几何/供应商/方案切换中止旧请求；迟到结果不能覆盖新路线", async () => {
  const fixture = setup(); fixture.context.route = fixture.route("old"); fixture.setEnabled(true); await settle();
  const old = fixture.requests[0];
  fixture.context.route = fixture.route("new"); fixture.context.revision++; fixture.context.mapProvider = "tencent"; fixture.context.planId = "other-plan"; fixture.render();
  assert.equal(fixture.value.profile, null); assert.equal(old.signal.aborted, true);
  await settle(); assert.equal(fixture.requests.length, 2);
  old.release(999); await settle(); assert.equal(fixture.value.profile, null);
  fixture.requests[1].release(-20); await settle(); assert.equal(fixture.value.profile.samples[0].elevationMeters, -20);
  fixture.dispose();
});
test("已有路段选择同步范围；恢复全程不改路线或发起高程请求", async () => {
  const fixture = setup(); fixture.context.route = fixture.route("leg"); fixture.setEnabled(true); await settle(); fixture.requests[0].release(0); await settle();
  fixture.setLegId(fixture.context.route.legs[0].id); assert.equal(fixture.value.range.startMeters, 0); assert.ok(fixture.value.range.endMeters > 300);
  const route = fixture.context.route;
  fixture.value.setRange({ startMeters: 30, endMeters: 100 }); await settle(); assert.equal(fixture.value.range.startMeters, 30);
  fixture.setLegId(null); assert.equal(fixture.value.range.startMeters, 0); assert.equal(fixture.context.route, route); assert.equal(fixture.requests.length, 1);
  fixture.dispose();
});
test("失败可独立重试，收起时终止请求并忽略迟到回写", async () => {
  const fixture = setup(); fixture.context.route = fixture.route("retry"); fixture.setEnabled(true); await settle(); fixture.requests[0].reject(new Error("试验服务超时")); await settle();
  assert.equal(fixture.value.state.status, "failed"); fixture.value.retry(); await settle(); assert.equal(fixture.requests.length, 2);
  fixture.setEnabled(false); assert.equal(fixture.requests[1].signal.aborted, true); fixture.requests[1].release(0); await settle(); assert.equal(fixture.value.profile, null);
  fixture.dispose();
});
