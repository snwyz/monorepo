import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadRoute(env = {}, query = async () => ({ elevations: [0], sourceVersion: "试验来源" })) {
  const compiled = ts.transpileModule(readFileSync(new URL("./route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const scriptModule = { exports: {} };
  class ElevationServiceError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const calls = [];
  vm.runInNewContext(compiled, {
    module: scriptModule, exports: scriptModule.exports, process: { env },
    require: (name) => {
      if (name === "next/server") return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers }) } };
      if (name.endsWith("open-topo-service")) return { ElevationServiceError, queryOpenTopoElevation: async (...args) => { calls.push(args); return query(...args); } };
      throw new Error(`未预期依赖：${name}`);
    },
  });
  return { POST: scriptModule.exports.POST, calls };
}
function request(body, headers = {}) {
  return { headers: new Headers(headers), nextUrl: { origin: "https://roadbook.test" }, signal: new AbortController().signal, text: async () => JSON.stringify(body) };
}
const point = { latitude: 30, longitude: 120 };

test("正式环境默认关闭试验来源，显式开关后才允许查询", async () => {
  const closed = loadRoute({ NODE_ENV: "production" });
  const response = await closed.POST(request({ coordinates: [point] }));
  assert.equal(response.status, 503); assert.equal(closed.calls.length, 0); assert.equal(response.headers["Cache-Control"], "no-store");
  const enabled = loadRoute({ NODE_ENV: "production", ELEVATION_PUBLIC_API_ENABLED: "1" });
  assert.equal((await enabled.POST(request({ coordinates: [point] }))).status, 200); assert.equal(enabled.calls.length, 1);
});
test("拒绝跨站来源与过大请求，不发送高程查询", async () => {
  const route = loadRoute();
  assert.equal((await route.POST(request({ coordinates: [point] }, { origin: "https://other.test" }))).status, 403);
  assert.equal((await route.POST(request({ coordinates: [point] }, { "content-length": "20001" }))).status, 413);
  assert.equal(route.calls.length, 0);
});
test("空正文对象、错误坐标、空批次与超额批次均被拒绝", async () => {
  const route = loadRoute();
  for (const body of [null, 12, {}, { coordinates: [] }, { coordinates: [{ latitude: "30", longitude: 120 }] }, { coordinates: [{ latitude: 91, longitude: 120 }] }, { coordinates: Array.from({ length: 101 }, () => point) }]) {
    assert.equal((await route.POST(request(body))).status, 400);
  }
  const malformed = request(null); malformed.text = async () => "{";
  assert.equal((await route.POST(malformed)).status, 400); assert.equal(route.calls.length, 0);
});
test("开发环境接受合法批次，保留零米、负海拔与未知值", async () => {
  const route = loadRoute({ NODE_ENV: "development" }, async () => ({ elevations: [0, -20, null], sourceVersion: "试验来源" }));
  const response = await route.POST(request({ coordinates: [point, point, point] }, { origin: "https://roadbook.test" }));
  assert.equal(response.status, 200); assert.deepEqual(response.body.elevations, [0, -20, null]); assert.equal(route.calls.length, 1);
});
test("高程服务异常独立降级，内部异常内容不写入响应", async () => {
  const route = loadRoute({}, async () => { throw new Error("内部敏感详情"); });
  const response = await route.POST(request({ coordinates: [point] }));
  assert.equal(response.status, 502); assert.equal(response.body.message, "高程服务暂不可用");
});
