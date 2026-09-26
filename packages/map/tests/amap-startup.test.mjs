import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// 在隔离环境执行真实适配器源码，模拟网络与 SDK 完成顺序，不访问真实地图服务。
function setup() {
  const requests = [];
  const scripts = [];
  const window = { location: { hostname: "test.invalid", origin: "https://test.invalid" } };
  const context = vm.createContext({
    window,
    console,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    fetch(url) {
      return new Promise((resolve, reject) => requests.push({ url, resolve, reject }));
    },
    document: {
      getElementById: () => null,
      createElement() {
        const listeners = {};
        return { listeners, addEventListener: (name, callback) => { listeners[name] = callback; } };
      },
      head: { appendChild: (script) => scripts.push(script) },
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
  const { AmapWebAdapter } = load(fileURLToPath(new URL("../src/amap-web.ts", import.meta.url)));
  return {
    AmapWebAdapter,
    requests,
    scripts,
    sdkReady() {
      window.AMap = {};
      scripts[scripts.length - 1].listeners.load();
    },
    ipReady(index = 0, rectangle = "110,30;112,32") {
      requests[index].resolve({ ok: true, json: async () => ({ status: "1", rectangle }) });
    },
  };
}

test("SDK 未完成时已发起 IP 请求，IP 先完成时复用结果", async () => {
  const fixture = setup();
  const creation = fixture.AmapWebAdapter.create({ key: "test-key" });
  assert.equal(fixture.scripts.length, 1);
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.requests[0].url, "/api/amap/ip-location");
  fixture.ipReady();
  fixture.sdkReady();
  const adapter = await creation;
  const coordinate = await adapter.resolveInitialLocation();
  assert.equal(coordinate.latitude, 31);
  assert.equal(coordinate.longitude, 111);
  assert.equal(await adapter.resolveInitialLocation(), coordinate);
  assert.equal(fixture.requests.length, 1);
});

test("SDK 先完成时仍等待 IP，不提前返回默认中心", async () => {
  const fixture = setup();
  const creation = fixture.AmapWebAdapter.create({ key: "test-key" });
  fixture.sdkReady();
  const adapter = await creation;
  let finished = false;
  const location = adapter.resolveInitialLocation().then((coordinate) => { finished = true; return coordinate; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(finished, false);
  fixture.ipReady();
  assert.equal((await location).longitude, 111);
});

test("IP 先失败不会产生未处理拒绝，SDK 就绪后允许地图降级", async () => {
  const fixture = setup();
  const creation = fixture.AmapWebAdapter.create({ key: "test-key" });
  fixture.requests[0].reject(new Error("模拟定位网络失败"));
  await new Promise((resolve) => setImmediate(resolve));
  fixture.sdkReady();
  assert.equal(await (await creation).resolveInitialLocation(), null);
});

test("SDK 失败后可重试，新适配器不复用上次位置", async () => {
  const fixture = setup();
  const failed = fixture.AmapWebAdapter.create({ key: "test-key" });
  fixture.scripts[0].listeners.error(new Error("模拟 SDK 失败"));
  await assert.rejects(failed, { code: "LOAD_FAILED" });
  const retry = fixture.AmapWebAdapter.create({ key: "test-key" });
  fixture.ipReady(1, "120,40;122,42");
  fixture.sdkReady();
  const adapter = await retry;
  fixture.ipReady(0);
  assert.equal((await adapter.resolveInitialLocation()).longitude, 121);
  assert.equal(fixture.requests.length, 2);
});

test("缺少 Key 时不发起网络请求，非法 IP 数据降级为 null", async () => {
  const fixture = setup();
  await assert.rejects(fixture.AmapWebAdapter.create({ key: " " }), { code: "MISSING_KEY" });
  assert.equal(fixture.requests.length, 0);
  assert.equal(fixture.scripts.length, 0);
  const creation = fixture.AmapWebAdapter.create({ key: "test-key" });
  fixture.ipReady(0, "invalid");
  fixture.sdkReady();
  assert.equal(await (await creation).resolveInitialLocation(), null);
});
