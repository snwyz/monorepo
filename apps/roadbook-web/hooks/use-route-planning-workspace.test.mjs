import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// 执行真实 Hook，通过可控状态生命周期与异步适配器验证请求、取消和缓存。
const controls = Array.from({ length: 4 }, (_, index) => ({
  id: `p${index}`, latitude: 30 + index, longitude: 110 + index, name: `测试点 ${index}`, address: "测试地址",
}));
const plan = { id: "test", name: "测试路线", strategy: "highway", controlPoints: controls, revision: 0, updatedAt: "2026-10-07T00:00:00Z", schemaVersion: 1 };
const makeRoute = (points) => ({
  scope: "one-way", strategy: "highway",
  legs: points.slice(0, -1).map((point, index) => ({
    id: `${point.id}:${points[index + 1].id}`, fromControlPointId: point.id, toControlPointId: points[index + 1].id,
    distanceMeters: 1000, durationMinutes: 5, trafficLightCount: null, path: [],
  })),
  distanceMeters: (points.length - 1) * 1000, durationMinutes: (points.length - 1) * 5, trafficLightCount: null,
});
const settle = async () => { for (let index = 0; index < 6; index += 1) await new Promise((resolve) => setTimeout(resolve, 2)); };
const calculate = () => new Promise((resolve) => setTimeout(resolve, 430));
const nativeRequire = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));

function setup() {
  const pageEvents = new Map();
  const storage = new Map();
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
    key: (index) => [...storage.keys()][index] ?? null,
    get length() { return storage.size; },
  };
  for (const id of ["test", "next"]) storage.set(`roadbook.route-plan.v1.${id}`, JSON.stringify({ ...plan, id }));
  const slots = [];
  const requests = [];
  let cursor = 0;
  let scheduled = false;
  let disposed = false;
  let result;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const schedule = () => {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; if (!disposed) TestWorkspace(); });
  };
  const memo = (factory, deps) => {
    const index = cursor++;
    if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: factory(), deps };
    return slots[index].value;
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, (next) => {
        const value = typeof next === "function" ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; schedule(); }
      }];
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      const value = getSnapshot();
      react.useEffect(() => subscribe(schedule), [subscribe]);
      return value;
    },
    useRef(initial) { return memo(() => ({ current: initial }), []); },
    useMemo: memo,
    useCallback(fn, deps) { return memo(() => fn, deps); },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps, effect, cleanup: previous?.cleanup, pending: true };
      }
    },
  };
  const adapter = {
    calculateDrivingRoute(points, strategy, scope, signal) {
      return new Promise((resolve, reject) => requests.push({ points, strategy, scope, signal, resolve, reject }));
    },
  };
  const cache = new Map();
  function load(relative) {
    relative = resolve(root, relative);
    if (cache.has(relative)) return cache.get(relative);
    const scriptModule = { exports: {} };
    const source = ts.transpileModule(readFileSync(relative, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const require = (specifier) => {
      if (specifier === "react") return react;
      if (specifier === "@roadbook/map/web") return { AmapWebAdapter: { create: async () => adapter }, TencentMapWebAdapter: { create: async () => adapter } };
      if (specifier.startsWith("@/")) return load(`${specifier.slice(2)}.ts`);
      if (specifier.startsWith(".")) return load(resolve(dirname(relative), `${specifier}.ts`));
      if (["xstate", "zustand/vanilla"].includes(specifier)) return nativeRequire(specifier);
      throw new Error(`未预期依赖：${specifier}`);
    };
    vm.runInNewContext(source, {
      module: scriptModule, exports: scriptModule.exports, require, process: { env: {} },
      window: { setTimeout, clearTimeout, localStorage,
        addEventListener: (name, callback) => pageEvents.set(name, callback),
        removeEventListener: (name) => pageEvents.delete(name),
      }, setTimeout, clearTimeout, queueMicrotask, AbortController, Error, crypto: { randomUUID: () => `test-id-${storage.size}-${Date.now()}` },
    });
    cache.set(relative, scriptModule.exports);
    return scriptModule.exports;
  }
  const { useRoutePlanningWorkspace } = load("hooks/use-route-planning-workspace.ts");
  function TestWorkspace() {
    cursor = 0;
    result = useRoutePlanningWorkspace();
    for (const slot of slots) {
      if (!slot.pending) continue;
      slot.pending = false;
      slot.cleanup?.();
      slot.cleanup = slot.effect();
    }
  }
  TestWorkspace();
  return {
    get current() { return result; }, requests, storage, localStorage, adapter,
    pagehide() { pageEvents.get("pagehide")?.(); },
    dispose() { disposed = true; for (const slot of slots) slot.cleanup?.(); },
  };
}

async function ready(t) {
  const workspace = setup();
  t.after(() => workspace.dispose());
  await settle();
  workspace.current.loadPlan("test");
  await calculate();
  assert.equal(workspace.requests.length, 1);
  assert.equal(workspace.requests[0].scope, "one-way");
  workspace.requests[0].resolve(makeRoute(controls));
  await settle();
  return workspace;
}

test("默认单程，开启往返只补算末点至起点；再次开启命中缓存", async (t) => {
  const workspace = await ready(t);
  assert.equal(workspace.current.includeReturn, false);
  assert.equal(workspace.current.route.legs.length, 3);
  workspace.current.toggleReturnRoute();
  await settle();
  assert.equal(workspace.current.returnRouteLoading, true);
  assert.equal(workspace.current.route.scope, "one-way");
  assert.equal(workspace.requests[1].points.map((point) => point.id).join(","), "p3,p0");
  workspace.requests[1].resolve(makeRoute([controls[3], controls[0]]));
  await settle();
  assert.equal(workspace.current.route.scope, "round-trip");
  assert.equal(workspace.current.route.distanceMeters, 4000);
  workspace.current.toggleReturnRoute();
  await settle();
  assert.equal(workspace.current.route.scope, "one-way");
  workspace.current.toggleReturnRoute();
  await settle();
  assert.equal(workspace.current.route.scope, "round-trip");
  assert.equal(workspace.requests.length, 2);
});

test("取消返程中止请求，迟到成功结果不得重新显示往返", async (t) => {
  const workspace = await ready(t);
  workspace.current.toggleReturnRoute();
  await settle();
  workspace.current.toggleReturnRoute();
  await settle();
  assert.equal(workspace.requests[1].signal.aborted, true);
  workspace.requests[1].resolve(makeRoute([controls[3], controls[0]]));
  await settle();
  assert.equal(workspace.current.route.scope, "one-way");
  assert.equal(workspace.current.returnRouteLoading, false);
});

test("返程失败保留单程，点击可重新补算", async (t) => {
  const workspace = await ready(t);
  workspace.current.toggleReturnRoute();
  await settle();
  workspace.requests[1].reject(new Error("模拟返程失败"));
  await settle();
  assert.equal(workspace.current.includeReturn, false);
  assert.equal(workspace.current.route.scope, "one-way");
  assert.ok(workspace.current.returnRouteError);
  workspace.current.toggleReturnRoute();
  await settle();
  assert.equal(workspace.requests.length, 3);
  assert.equal(workspace.current.returnRouteError, null);
});

test("切换方案重置单程并隔离旧返程，旧成功不得覆盖新方案", async (t) => {
  const workspace = await ready(t);
  workspace.current.toggleReturnRoute();
  await settle();
  workspace.current.loadPlan("next");
  await calculate();
  workspace.requests[1].resolve(makeRoute([controls[3], controls[0]]));
  await settle();
  assert.equal(workspace.current.includeReturn, false);
  assert.equal(workspace.current.activePlan.id, "next");
  assert.equal(workspace.current.route, null);
  assert.equal(workspace.requests[1].signal.aborted, true);
  workspace.requests[2].resolve(makeRoute(controls));
  await settle();
  assert.equal(workspace.current.route.scope, "one-way");
});

test("策略变化中止旧返程，不得让返程抢占新单程计算", async (t) => {
  const workspace = await ready(t);
  workspace.current.toggleReturnRoute();
  await settle();
  workspace.current.setStrategy("avoid-highway");
  await calculate();
  assert.equal(workspace.requests.length, 3);
  assert.equal(workspace.requests[2].points.length, 4);
  assert.equal(workspace.requests[2].strategy, "avoid-highway");
  assert.equal(workspace.requests[1].signal.aborted, true);
  workspace.requests[1].resolve(makeRoute([controls[3], controls[0]]));
  await settle();
  assert.equal(workspace.current.route.scope, "one-way");
});

test("编辑后立即切方案交接真实仓储，卸载前也保存最后一次编辑", async (t) => {
  const workspace = await ready(t);
  workspace.current.renamePlan("快速切换前的名称");
  assert.equal(workspace.current.loadPlan("next"), true);
  assert.equal(JSON.parse(workspace.storage.get("roadbook.route-plan.v1.test")).name, "快速切换前的名称");
  await settle();
  workspace.current.renamePlan("卸载前的名称");
  workspace.dispose();
  assert.equal(JSON.parse(workspace.storage.get("roadbook.route-plan.v1.next")).name, "卸载前的名称");
});

test("暂存失败保留编辑与原路线，阻止切换；重试成功后可加载", async (t) => {
  const workspace = await ready(t);
  const route = workspace.current.route;
  const save = workspace.localStorage.setItem;
  workspace.localStorage.setItem = () => { throw new Error("模拟存储空间不足"); };
  workspace.current.renamePlan("未保存的编辑");
  assert.equal(workspace.current.loadPlan("next"), false);
  await settle();
  assert.equal(workspace.current.activePlan.id, "test");
  assert.equal(workspace.current.activePlan.name, "未保存的编辑");
  assert.equal(workspace.current.draftStatus, "failed");
  assert.equal(workspace.current.route, route);
  workspace.localStorage.setItem = save;
  workspace.current.retrySave();
  await settle();
  assert.equal(workspace.current.draftStatus, "saved");
  assert.equal(JSON.parse(workspace.storage.get("roadbook.route-plan.v1.test")).name, "未保存的编辑");
  assert.equal(workspace.current.loadPlan("next"), true);
});

test("撤销使用当前修订递增，元数据编辑与撤销均不重复算路", async (t) => {
  const workspace = await ready(t);
  workspace.current.renamePlan("名称一");
  workspace.current.renamePlan("名称二");
  workspace.current.renamePlan("名称三");
  await settle();
  const revision = workspace.current.activePlan.revision;
  workspace.current.undo();
  workspace.current.undo();
  await settle();
  assert.equal(workspace.current.activePlan.name, "名称一");
  assert.equal(workspace.current.activePlan.revision, revision + 2);
  assert.equal(workspace.current.routeContext.revision, revision + 2);
  assert.equal(workspace.current.routeContext.sourceRevision, 0);
  assert.equal(workspace.requests.length, 1);
});

test("排序、删除与撤销通过同一方案命令更新，恢复内容继续递增修订", async (t) => {
  const workspace = await ready(t);
  workspace.current.reorderControlPoint("p0", "p3");
  await settle();
  assert.equal(workspace.current.activePlan.controlPoints.map((point) => point.id).join(","), "p1,p2,p3,p0");
  assert.equal(workspace.current.routeContext, null);
  workspace.current.removeControlPoint("p2");
  workspace.current.undo();
  workspace.current.undo();
  await settle();
  assert.equal(workspace.current.activePlan.controlPoints.map((point) => point.id).join(","), "p0,p1,p2,p3");
  assert.equal(workspace.current.activePlan.revision, 4);
  workspace.pagehide();
  assert.equal(JSON.parse(workspace.storage.get("roadbook.route-plan.v1.test")).revision, 4);
});

test("删除和清空先撤销待保存任务，定时器与卸载不能复活方案", async (t) => {
  const workspace = await ready(t);
  workspace.current.renamePlan("待删除内容");
  workspace.current.deletePlan("test");
  await calculate();
  assert.equal(workspace.storage.has("roadbook.route-plan.v1.test"), false);
  workspace.current.loadPlan("next");
  await settle();
  workspace.current.renamePlan("待清除内容");
  workspace.current.clearPlans();
  await calculate();
  workspace.dispose();
  assert.equal(workspace.storage.size, 0);
});

test("计算输入恢复相同仍隔离旧批次，输入改变同步撤销有效路线", async (t) => {
  const workspace = setup();
  t.after(() => workspace.dispose());
  await settle();
  workspace.current.loadPlan("test");
  await calculate();
  const old = workspace.requests[0];
  workspace.current.setStrategy("avoid-highway");
  await calculate();
  workspace.current.undo();
  await calculate();
  assert.equal(old.signal.aborted, true);
  old.resolve(makeRoute(controls));
  await settle();
  assert.equal(workspace.current.routeContext, null);
  workspace.requests[2].resolve(makeRoute(controls));
  await settle();
  const published = workspace.current.routeContext;
  workspace.current.setStrategy("avoid-highway");
  await settle();
  assert.equal(workspace.current.routeContext, null);
  assert.equal(workspace.current.insertPlaceCandidate({
    planId: "test", fromId: "p0", toId: "p1", routeContext: published,
  }, { id: "old-station", name: "旧站点", address: "测试地址", coordinate: controls[0] }), false);
});

test("加载失败保持原活动方案、有效路线和未保存内容", async (t) => {
  const workspace = await ready(t);
  workspace.current.renamePlan("仍在当前方案");
  const route = workspace.current.route;
  assert.equal(workspace.current.loadPlan("missing"), false);
  await settle();
  assert.equal(workspace.current.activePlan.name, "仍在当前方案");
  assert.equal(workspace.current.route, route);
});

test("浏览器离开页面立即保存最新快照，不依赖 React 卸载", async (t) => {
  const workspace = await ready(t);
  workspace.current.renamePlan("离开页面前的编辑");
  workspace.pagehide();
  assert.equal(JSON.parse(workspace.storage.get("roadbook.route-plan.v1.test")).name, "离开页面前的编辑");
});

test("返程返回错误方向时独立失败，单程与其他能力保持可用", async (t) => {
  const workspace = await ready(t);
  workspace.current.toggleReturnRoute();
  await settle();
  workspace.requests[1].resolve(makeRoute([controls[0], controls[3]]));
  await settle();
  assert.equal(workspace.current.includeReturn, false);
  assert.ok(workspace.current.returnRouteError);
  assert.equal(workspace.current.route.scope, "one-way");
  workspace.current.renamePlan("仍可编辑");
  await settle();
  assert.equal(workspace.current.activePlan.name, "仍可编辑");
});

test("地址补全失败保留坐标；离开后重载同一方案也拒绝旧补全", async (t) => {
  const workspace = await ready(t);
  let complete;
  workspace.adapter.reverseGeocode = () => new Promise((resolve) => { complete = resolve; });
  const pending = workspace.current.addCoordinate({ latitude: 32, longitude: 112 });
  await settle();
  workspace.current.loadPlan("next");
  workspace.current.loadPlan("test");
  complete({ name: "迟到的名称", address: "迟到的地址" });
  await pending;
  await settle();
  assert.equal(workspace.current.activePlan.controlPoints[4].name, "地图选点");
  workspace.adapter.reverseGeocode = async () => { throw new Error("模拟地址失败"); };
  await workspace.current.addCoordinate({ latitude: 33, longitude: 113 });
  await settle();
  assert.equal(workspace.current.activePlan.controlPoints[5].address, "未识别地址");
  assert.equal(workspace.current.activePlan.controlPoints[5].latitude, 33);
});

test("重载同一空方案时隔离旧定位批次，只写入当前起点", async (t) => {
  const workspace = setup();
  t.after(() => workspace.dispose());
  await settle();
  workspace.storage.set("roadbook.route-plan.v1.empty", JSON.stringify({ ...plan, id: "empty", controlPoints: [] }));
  const locations = [];
  workspace.adapter.resolveCurrentLocation = () => new Promise((resolve) => locations.push(resolve));
  workspace.adapter.reverseGeocode = async () => ({ name: "当前位置", address: "测试起点" });
  workspace.current.loadPlan("empty");
  workspace.current.loadPlan("empty");
  locations[0]({ approximate: false, coordinate: { latitude: 20, longitude: 100 } });
  await settle();
  assert.equal(workspace.current.activePlan.controlPoints.length, 0);
  locations[1]({ approximate: false, coordinate: { latitude: 30, longitude: 110 } });
  await settle();
  assert.equal(workspace.current.activePlan.controlPoints.length, 1);
  assert.equal(workspace.current.activePlan.controlPoints[0].latitude, 30);
});

test("取消与重试隔离迟到响应，供应商切换保留方案待保存内容", async (t) => {
  const workspace = setup();
  t.after(() => workspace.dispose());
  await settle();
  workspace.current.loadPlan("test");
  await calculate();
  workspace.current.cancelRouteCalculation();
  await settle();
  assert.equal(workspace.requests[0].signal.aborted, true);
  workspace.current.retryRouteCalculation();
  await calculate();
  workspace.requests[0].resolve(makeRoute(controls));
  await settle();
  assert.equal(workspace.current.route, null);
  workspace.requests[1].resolve(makeRoute(controls));
  await settle();
  workspace.current.renamePlan("切换供应商时的编辑");
  workspace.current.setMapProvider("tencent");
  await calculate();
  assert.equal(workspace.current.mapProvider, "tencent");
  assert.equal(workspace.current.routeContext, null);
  assert.equal(JSON.parse(workspace.storage.get("roadbook.route-plan.v1.test")).name, "切换供应商时的编辑");
});
