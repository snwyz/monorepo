import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const domainModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../../domain/route-planning/model.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText, { module: domainModule, exports: domainModule.exports });
const { createRoutePlan, normalizeRoutePlanStrategy } = domainModule.exports;

const source = ts.transpileModule(readFileSync(new URL("./local-route-plan-repository.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;

test("新方案默认高速优先", () => {
  assert.equal(createRoutePlan("new").strategy, "highway");
});

test("旧快照加载时兼容策略，保留点位及元数据且不直接改写存储", () => {
  for (const [strategy, expected] of [["recommend", "highway"], ["highway", "highway"], ["avoid-highway", "avoid-highway"], [undefined, "highway"]]) {
    const snapshot = { ...createRoutePlan("saved"), strategy, revision: 7, name: "测试路线", controlPoints: [{ id: "p1", name: "点位", address: "测试地址", latitude: 30, longitude: 104 }] };
    const raw = JSON.stringify(snapshot);
    const repositoryModule = { exports: {} };
    const context = vm.createContext({
      module: repositoryModule, exports: repositoryModule.exports,
      require: () => ({ normalizeRoutePlanStrategy }),
      window: { localStorage: {
        getItem: (key) => key === "roadbook.route-plan.v1.saved" ? raw : null,
        setItem: () => assert.fail("加载不应直接写入存储"),
      } },
    });
    vm.runInContext(source, context);
    const loaded = new repositoryModule.exports.LocalRoutePlanRepository().load("saved");
    assert.deepEqual(JSON.parse(JSON.stringify(loaded)), { ...JSON.parse(raw), strategy: expected });
  }
});
