import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const domainModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("./route-travel-scope.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText, { module: domainModule, exports: domainModule.exports });
const { appendReturnLeg } = domainModule.exports;
const leg = (from, to, distance, minutes) => ({
  id: `${from}:${to}`, fromControlPointId: from, toControlPointId: to,
  distanceMeters: distance, durationMinutes: minutes, trafficLightCount: 2, path: [],
});
const oneWay = {
  scope: "one-way", strategy: "highway", legs: [leg("a", "b", 1000, 3), leg("b", "c", 2000, 5)],
  distanceMeters: 3000, durationMinutes: 8, trafficLightCount: 4,
};

test("补算返程采用实际道路指标，保持单程数据不变", () => {
  const roundTrip = appendReturnLeg(oneWay, leg("c", "a", 4500, 10));
  assert.equal(roundTrip.scope, "round-trip");
  assert.equal(roundTrip.distanceMeters, 7500);
  assert.equal(roundTrip.durationMinutes, 18);
  assert.equal(roundTrip.trafficLightCount, 6);
  assert.equal(roundTrip.legs.map((item) => item.id).join(","), "a:b,b:c,c:a");
  assert.equal(oneWay.legs.length, 2);
  assert.equal(oneWay.distanceMeters, 3000);
});

test("拒绝旧点位或错误方向的返程，避免拼接不同版本", () => {
  assert.throws(() => appendReturnLeg(oneWay, leg("b", "a", 1, 1)), /不匹配/);
  assert.throws(() => appendReturnLeg(oneWay, leg("c", "b", 1, 1)), /不匹配/);
  assert.throws(() => appendReturnLeg({ ...oneWay, scope: "round-trip" }, leg("c", "a", 1, 1)), /不匹配/);
});

test("返程道路信息缺失时保留未知值", () => {
  assert.equal(appendReturnLeg(oneWay, { ...leg("c", "a", 1, 1), trafficLightCount: null }).trafficLightCount, null);
});
