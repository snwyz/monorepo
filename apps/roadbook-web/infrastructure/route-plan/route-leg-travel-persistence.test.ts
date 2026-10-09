import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalRoutePlanRepository } from "./local-route-plan-repository";
import { createRoutePlanPersistence } from "@/application/route-plan/route-plan-persistence";
import { createRoutePlanSession } from "@/application/route-plan/route-plan-session";
import { createRoutePlan } from "@/domain/route-planning/model";
import { changeRouteLegTravelMode } from "@/domain/route-planning/route-leg-travel-mode";

const points = ["a", "b", "c"].map((id, index) => ({ id, name: id, address: "", latitude: 30 + index, longitude: 104 }));
const plan = { ...createRoutePlan("plan"), controlPoints: points };
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } });
});
afterEach(() => vi.unstubAllGlobals());

describe("出行方式的保存与恢复", () => {
  it("旧方案兼容汽车，步骑方式重开仓储后保留，非法连接被清理", () => {
    const repository = new LocalRoutePlanRepository(); repository.save(plan);
    expect(repository.load(plan.id)?.legTravelModes).toEqual({});
    repository.save({ ...plan, legTravelModes: { "a:b": "cycling", "c:a": "walking", "a:c": "walking" } });
    expect(new LocalRoutePlanRepository().load(plan.id)?.legTravelModes).toEqual({ "a:b": "cycling", "c:a": "walking" });
  });
  it("排序清理已断开的模式，撤销恢复模式，重新保存仍一致", () => {
    const repository = new LocalRoutePlanRepository();
    const persistence = createRoutePlanPersistence(repository);
    const session = createRoutePlanSession(repository, persistence);
    try {
      session.create(plan);
      session.edit((current) => changeRouteLegTravelMode(current, "a:b", "cycling"));
      session.edit((current) => ({ ...current, controlPoints: [points[0], points[2], points[1]] }));
      expect(session.state.getState().activePlan?.legTravelModes).toEqual({});
      session.undo(); persistence.flush(plan.id);
      expect(repository.load(plan.id)?.legTravelModes).toEqual({ "a:b": "cycling" });
    } finally { persistence.dispose(); }
  });
});
