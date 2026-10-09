import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DrivingRoute, RouteTravelMode, WebMapAdapter } from "@roadbook/map/web";
import { createRoutePlan } from "@/domain/route-planning/model";
import { changeRouteLegTravelMode } from "@/domain/route-planning/route-leg-travel-mode";
import { createRouteCalculationActor, queryRouteCalculation } from "./route-calculation-actor";

const points = ["a", "b"].map((id, index) => ({ id, name: id, address: "", latitude: 30, longitude: 104 + index }));
const plan = { ...createRoutePlan("plan"), controlPoints: points };
function route(from = "a", to = "b", mode: RouteTravelMode = "driving"): DrivingRoute {
  return { scope: "one-way", strategy: "highway", distanceMeters: 1000, durationMinutes: mode === "walking" ? 20 : 2, trafficLightCount: null,
    legs: [{ id: `${from}:${to}`, fromControlPointId: from, toControlPointId: to, travelMode: mode, distanceMeters: 1000, durationMinutes: mode === "walking" ? 20 : 2, trafficLightCount: null, path: points }],
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("交通方式与路线流程", () => {
  it("编辑取消旧任务、保留旧路段但不发布旧指标，失败后重试使用当前方式", async () => {
    const calculateRoute = vi.fn().mockResolvedValueOnce(route()).mockRejectedValueOnce(new Error("步行不可达")).mockResolvedValueOnce(route("a", "b", "walking"));
    const adapter = { calculateRoute } as unknown as WebMapAdapter;
    const actor = createRouteCalculationActor(); actor.start();
    const input = { plan, activation: 1, provider: "amap" as const, adapter, connection: "ready" as const };
    try {
      actor.send({ type: "INPUT", input }); await vi.advanceTimersByTimeAsync(500);
      const changed = changeRouteLegTravelMode(plan, "a:b", "walking");
      actor.send({ type: "INPUT", input: { ...input, plan: changed } });
      expect(queryRouteCalculation(actor.getSnapshot()).route?.legs[0].travelMode).toBe("driving");
      expect(queryRouteCalculation(actor.getSnapshot()).published).toBeNull();
      await vi.advanceTimersByTimeAsync(500);
      expect(queryRouteCalculation(actor.getSnapshot()).routeStatus).toBe("failed");
      actor.send({ type: "RETRY" }); await vi.advanceTimersByTimeAsync(500);
      expect(calculateRoute.mock.calls[2][3]).toEqual({ "a:b": "walking" });
      expect(queryRouteCalculation(actor.getSnapshot()).published?.route.legs[0].travelMode).toBe("walking");
    } finally { actor.stop(); }
  });
  it("返程改为步行后保持往返与当前旧返程，完成后汇总真实结果", async () => {
    const calculateRoute = vi.fn().mockResolvedValueOnce(route()).mockResolvedValueOnce(route("b", "a"))
      .mockResolvedValueOnce(route()).mockResolvedValueOnce(route("b", "a", "walking"));
    const adapter = { calculateRoute } as unknown as WebMapAdapter;
    const actor = createRouteCalculationActor(); actor.start();
    const input = { plan, activation: 1, provider: "amap" as const, adapter, connection: "ready" as const };
    try {
      actor.send({ type: "INPUT", input }); await vi.advanceTimersByTimeAsync(500);
      actor.send({ type: "TOGGLE_RETURN" }); await vi.advanceTimersByTimeAsync(50);
      actor.send({ type: "INPUT", input: { ...input, plan: changeRouteLegTravelMode(plan, "b:a", "walking") } });
      expect(queryRouteCalculation(actor.getSnapshot()).route?.scope).toBe("round-trip");
      expect(queryRouteCalculation(actor.getSnapshot()).published).toBeNull();
      await vi.advanceTimersByTimeAsync(500);
      const result = queryRouteCalculation(actor.getSnapshot());
      expect(result.includeReturn).toBe(true);
      expect(result.route?.legs[1].travelMode).toBe("walking");
      expect(result.route?.durationMinutes).toBe(22);
      actor.send({ type: "TOGGLE_RETURN" }); actor.send({ type: "TOGGLE_RETURN" });
      expect(calculateRoute).toHaveBeenCalledTimes(4);
    } finally { actor.stop(); }
  });
  it("快速改方式时中止旧任务，迟到结果不能覆盖新模式", async () => {
    let resolveOld!: (value: DrivingRoute) => void;
    const calculateRoute = vi.fn().mockImplementationOnce(() => new Promise<DrivingRoute>((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce(route("a", "b", "walking"));
    const adapter = { calculateRoute } as unknown as WebMapAdapter;
    const actor = createRouteCalculationActor(); actor.start();
    const input = { plan, activation: 1, provider: "amap" as const, adapter, connection: "ready" as const };
    try {
      actor.send({ type: "INPUT", input }); await vi.advanceTimersByTimeAsync(500);
      actor.send({ type: "INPUT", input: { ...input, plan: changeRouteLegTravelMode(plan, "a:b", "walking") } });
      expect(calculateRoute.mock.calls[0][4].aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(500); resolveOld(route()); await vi.advanceTimersByTimeAsync(0);
      expect(queryRouteCalculation(actor.getSnapshot()).route?.legs[0].travelMode).toBe("walking");
    } finally { actor.stop(); }
  });
});
