import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// 用真实适配器代码和可控网络验证中止，不依赖地图 SDK 或真实坐标。
function setup(provider) {
  const requests = [];
  const context = vm.createContext({
    window: { setTimeout, clearTimeout }, console, URLSearchParams,
    fetch(url, { signal }) {
      return new Promise((resolve, reject) => {
        const request = { url, signal, resolve };
        requests.push(request);
        signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    },
  });
  const modules = new Map();
  function load(path) {
    if (modules.has(path)) return modules.get(path).exports;
    const module = { exports: {} };
    modules.set(path, module);
    const source = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const execute = vm.runInContext(`(function(require, module, exports) {${source}\n})`, context);
    execute((specifier) => load(resolve(dirname(path), `${specifier}.ts`)), module, module.exports);
    return module.exports;
  }

  const module = load(fileURLToPath(new URL(`../src/${provider}-web.ts`, import.meta.url)));
  const Adapter = provider === "amap" ? module.AmapWebAdapter : module.TencentMapWebAdapter;
  const adapter = new Adapter({}, Promise.resolve(null));
  return { adapter, requests };
}
const points = [{ id: "a", latitude: 30, longitude: 110 }, { id: "b", latitude: 31, longitude: 111 }];
const tick = () => new Promise((resolve) => setImmediate(resolve));
for (const provider of ["amap", "tencent-map"]) {
  test(`${provider}: 取消在途请求，不再请求返程；随后可以重新计算`, async () => {
    const { adapter, requests } = setup(provider);
    const controller = new AbortController();
    const pending = adapter.calculateClosedDrivingRoute(points, "recommend", controller.signal);
    const rejected = assert.rejects(pending);
    await tick();
    assert.equal(requests.length, 1);
    controller.abort();
    await rejected;
    await tick();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].signal.aborted, true);
    const next = new AbortController();
    adapter.nextDrivingRequestAt = 0;
    const second = adapter.calculateClosedDrivingRoute(points, "recommend", next.signal);
    const secondRejected = assert.rejects(second);
    await tick();
    assert.equal(requests.length, 2);
    next.abort();
    await secondRejected;
  });
  test(`${provider}: 排队时取消，不发送已取消的请求`, async () => {
    const { adapter, requests } = setup(provider);
    let release;
    adapter.drivingRequestQueue = new Promise((resolve) => { release = resolve; });
    const controller = new AbortController();
    const pending = adapter.calculateClosedDrivingRoute(points, "recommend", controller.signal);
    const rejected = assert.rejects(pending);
    controller.abort();
    release();
    await rejected;
    assert.equal(requests.length, 0);
  });
  test(`${provider}: 节流等待期间取消，不发送请求`, async () => {
    const { adapter, requests } = setup(provider);
    adapter.nextDrivingRequestAt = Date.now() + 30;
    const controller = new AbortController();
    const pending = adapter.calculateClosedDrivingRoute(points, "recommend", controller.signal);
    const rejected = assert.rejects(pending);
    await tick();
    controller.abort();
    await rejected;
    assert.equal(requests.length, 0);
  });
}

function resolveLeg(provider, request, distance = 1000) {
  const route = provider === "amap"
    ? { status: "1", route: { paths: [{ distance, duration: 120, traffic_lights: 2, steps: [{ polyline: "110,30;111,31" }] }] } }
    : { status: 0, result: { routes: [{ distance, duration: 2, traffic_light_count: 2, polyline: [30, 110, 1000000, 1000000] }] } };
  request.resolve({ ok: true, json: async () => route });
}

for (const provider of ["amap", "tencent-map"]) {
  for (const scope of ["one-way", "round-trip"]) {
    test(`${provider}: ${scope} 按控制点顺序请求并汇总，单程不请求返程`, async () => {
      const { adapter, requests } = setup(provider);
      const controls = [...points, { id: "c", latitude: 32, longitude: 112 }];
      const pending = adapter.calculateDrivingRoute(controls, "recommend", scope);
      const count = scope === "one-way" ? 2 : 3;
      for (let index = 0; index < count; index += 1) {
        await tick();
        assert.equal(requests.length, index + 1);
        const params = new URL(requests[index].url, "https://example.test").searchParams;
        const from = controls[index];
        const to = controls[(index + 1) % controls.length];
        assert.equal(params.get("from"), `${from.latitude},${from.longitude}`);
        assert.equal(params.get("to"), `${to.latitude},${to.longitude}`);
        adapter.nextDrivingRequestAt = 0;
        resolveLeg(provider, requests[index], (index + 1) * 1000);
      }
      const route = await pending;
      assert.equal(route.scope, scope);
      assert.equal(route.legs.length, count);
      assert.equal(route.distanceMeters, count === 2 ? 3000 : 6000);
      assert.equal(route.durationMinutes, count * 2);
      assert.equal(route.trafficLightCount, count * 2);
      assert.equal(requests.length, count);
    });
  }
  test(`${provider}: 补算返程只发送末点到起点的一次请求`, async () => {
    const { adapter, requests } = setup(provider);
    const pending = adapter.calculateDrivingRoute([points[1], points[0]], "recommend", "one-way");
    await tick();
    assert.equal(requests.length, 1);
    resolveLeg(provider, requests[0]);
    const route = await pending;
    assert.equal(route.legs[0].id, "b:a");
    assert.equal(requests.length, 1);
  });
}
