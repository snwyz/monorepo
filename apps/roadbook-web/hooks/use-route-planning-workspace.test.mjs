import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

function setup() {
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
  class Repository {
    list() { return []; }
    load(id) { return { ...plan, id }; }
    save() {}
  }
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const scriptModule = { exports: {} };
    const source = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const require = (specifier) => {
      if (specifier === "react") return react;
      if (specifier === "@roadbook/map/web") return { AmapWebAdapter: { create: async () => adapter }, TencentMapWebAdapter: { create: async () => adapter } };
      if (specifier.includes("local-route-plan-repository")) return { LocalRoutePlanRepository: Repository };
      if (specifier.endsWith("/model")) return load("../domain/route-planning/model.ts");
      if (specifier.endsWith("/route-travel-scope")) return load("../domain/route-planning/route-travel-scope.ts");
      throw new Error(`未预期依赖：${specifier}`);
    };
    vm.runInNewContext(source, {
      module: scriptModule, exports: scriptModule.exports, require, process: { env: {} },
      window: { setTimeout: (fn) => setTimeout(fn, 0), clearTimeout }, AbortController, crypto: { randomUUID: () => "test-id" },
    });
    cache.set(relative, scriptModule.exports);
    return scriptModule.exports;
  }
  const { useRoutePlanningWorkspace } = load("./use-route-planning-workspace.ts");
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
    get current() { return result; }, requests,
    dispose() { disposed = true; for (const slot of slots) slot.cleanup?.(); },
  };
}

async function ready(t) {
  const workspace = setup();
  t.after(() => workspace.dispose());
  await settle();
  workspace.current.loadPlan("test");
  await settle();
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
  await settle();
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
  await settle();
  assert.equal(workspace.requests.length, 3);
  assert.equal(workspace.requests[2].points.length, 4);
  assert.equal(workspace.requests[2].strategy, "avoid-highway");
  assert.equal(workspace.requests[1].signal.aborted, true);
  workspace.requests[1].resolve(makeRoute([controls[3], controls[0]]));
  await settle();
  assert.equal(workspace.current.route.scope, "one-way");
});
