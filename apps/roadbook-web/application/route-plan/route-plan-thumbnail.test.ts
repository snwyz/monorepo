import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DrivingRoute, MapCoordinate, WebMapAdapter } from "@roadbook/map/web";
import { createRoutePlan } from "@/domain/route-planning/model";
import { routeCalculationIdentity, type PublishedRouteContext } from "@/domain/route-planning/calculation-context";
import { createRoutePlanThumbnail, isRoutePlanThumbnail } from "@/domain/route-planning/route-plan-thumbnail";
import { LocalRoutePlanRepository } from "@/infrastructure/route-plan/local-route-plan-repository";
import { createRoutePlanPersistence } from "./route-plan-persistence";
import { createRoutePlanSession } from "./route-plan-session";
import { createRouteCalculationActor, queryRouteCalculation } from "@/application/route-calculation/route-calculation-actor";

const coordinates: MapCoordinate[] = [
  { latitude: 30, longitude: 104 },
  { latitude: 30.2, longitude: 104.1 },
  { latitude: 30.3, longitude: 104.8 },
];
function makePlan(id = "route") {
  return { ...createRoutePlan(id, new Date("2026-10-08T08:00:00Z")), controlPoints: [
    { ...coordinates[0], id: "start", name: "起点", address: "" },
    { ...coordinates[2], id: "end", name: "终点", address: "" },
  ] };
}
function makeRoute(paths = [coordinates]): DrivingRoute {
  return { scope: "one-way", strategy: "highway", distanceMeters: 1000, durationMinutes: 10, trafficLightCount: null,
    legs: paths.map((path, index) => ({ id: `leg-${index}`, fromControlPointId: "start", toControlPointId: "end",
      distanceMeters: 1000, durationMinutes: 10, trafficLightCount: null, path })),
  };
}
function publish(plan = makePlan(), route = makeRoute()): PublishedRouteContext {
  return { planId: plan.id, revision: plan.revision, sourceRevision: plan.revision,
    inputIdentity: routeCalculationIdentity(plan, "amap"), mapProvider: "amap", requestBatch: 1, route };
}
beforeEach(() => {
  vi.useFakeTimers();
  const storage = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() { return storage.size; },
  } });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("真实道路缩略轮廓", () => {
  it("保持道路折点、方向和比例，不强制闭合单程路线", () => {
    const result = createRoutePlanThumbnail(makeRoute(), "identity", "amap")!;
    expect(isRoutePlanThumbnail(result)).toBe(true);
    const path = result.paths[0];
    expect(path).toHaveLength(3);
    expect(path[0][0]).toBe(4);
    expect(path[2][0]).toBe(32);
    expect(path[0][1]).toBeGreaterThan(path[2][1]);
    expect(path[0][1] - path[2][1]).toBeCloseTo(12.2, 0);
    expect(path[0]).not.toEqual(path[2]);
  });
  it("长轨迹限制为最多96点，保留端点并分段绘制缺口", () => {
    const path = Array.from({ length: 10000 }, (_, index) => ({ latitude: 30 + Math.sin(index / 10) * 0.03, longitude: 104 + index / 10000 }));
    const result = createRoutePlanThumbnail(makeRoute([path, coordinates]), "identity", "amap")!;
    expect(result.paths).toHaveLength(2);
    expect(result.paths.flat().length).toBeLessThanOrEqual(96);
    expect(isRoutePlanThumbnail(result)).toBe(true);
  });
  it("水平、垂直、闭合与跨日期变更线路线均可展示", () => {
    for (const path of [
      [{ latitude: 30, longitude: 104 }, { latitude: 30, longitude: 105 }],
      [{ latitude: 30, longitude: 104 }, { latitude: 31, longitude: 104 }],
      [...coordinates, coordinates[0]],
      [{ latitude: 30, longitude: 179.9 }, { latitude: 30.1, longitude: -179.9 }],
    ]) expect(isRoutePlanThumbnail(createRoutePlanThumbnail(makeRoute([path]), "identity", "amap"))).toBe(true);
  });
  it("空、缺段、重合、非法坐标及返程结果降级，不伪造轮廓", () => {
    for (const route of [makeRoute([]), makeRoute([[]]), makeRoute([[coordinates[0], coordinates[0]]]),
      makeRoute([[coordinates[0], { latitude: NaN, longitude: 104 }]]),
      { ...makeRoute(), scope: "round-trip" as const },
    ]) expect(createRoutePlanThumbnail(route, "identity", "amap")).toBeUndefined();
    expect(isRoutePlanThumbnail({ inputIdentity: "x", mapProvider: "amap", paths: [[[4, 4], [Infinity, 5]]] })).toBe(false);
  });
});

describe("缩略轮廓与方案交接", () => {
  function setup() {
    const repository = new LocalRoutePlanRepository();
    const persistence = createRoutePlanPersistence(repository);
    const session = createRoutePlanSession(repository, persistence);
    const plan = makePlan();
    session.create(plan);
    return { repository, persistence, session, plan };
  }
  it("旧方案正常加载；算路补存后重开仓储直接读取轮廓且不改修订、时间或历史", () => {
    const { repository, persistence, session, plan } = setup();
    persistence.flush(plan.id);
    expect(repository.load(plan.id)?.thumbnail).toBeUndefined();
    session.captureThumbnail(publish(plan));
    persistence.flush(plan.id);
    const reopened = new LocalRoutePlanRepository();
    expect(reopened.list()[0].thumbnail).toEqual(reopened.load(plan.id)?.thumbnail);
    expect(reopened.list()[0].thumbnail).toBeDefined();
    expect(session.state.getState().activePlan?.revision).toBe(plan.revision);
    expect(reopened.list()[0].updatedAt).toBe(plan.updatedAt);
    expect(session.state.getState().history).toHaveLength(0);
  });
  it("重命名保留轮廓；坐标或策略变化清除旧轮廓，撤销可恢复匹配轮廓", () => {
    const { session, plan } = setup();
    session.captureThumbnail(publish(plan));
    const thumbnail = session.state.getState().activePlan?.thumbnail;
    session.edit((current) => ({ ...current, name: "新名称" }));
    expect(session.state.getState().activePlan?.thumbnail).toBe(thumbnail);
    session.edit((current) => ({ ...current, strategy: "avoid-highway" }));
    expect(session.state.getState().activePlan?.thumbnail).toBeUndefined();
    session.undo();
    expect(session.state.getState().activePlan?.thumbnail).toEqual(thumbnail);
    session.edit((current) => ({ ...current, controlPoints: current.controlPoints.map((point) => ({ ...point, latitude: point.latitude + 1 })) }));
    expect(session.state.getState().activePlan?.thumbnail).toBeUndefined();
    session.captureThumbnail(publish(plan));
    expect(session.state.getState().activePlan?.thumbnail).toBeUndefined();
  });
  it("切换方案后迟到结果与返程结果不能覆盖当前轮廓；相同结果只暂存一次", () => {
    const { session, persistence, plan } = setup();
    const schedule = vi.spyOn(persistence, "schedule");
    const published = publish(plan);
    session.captureThumbnail(published);
    session.captureThumbnail(published);
    expect(schedule).toHaveBeenCalledTimes(1);
    session.create(makePlan("other"));
    session.captureThumbnail(publish(plan));
    session.captureThumbnail(publish(makePlan("other"), { ...makeRoute(), scope: "round-trip" }));
    expect(session.state.getState().activePlan?.thumbnail).toBeUndefined();
  });
  it("损坏缩略数据不使整个方案或目录丢失；只读目录不加载快照", () => {
    const { session, persistence, repository, plan } = setup();
    session.captureThumbnail(publish(plan));
    persistence.flush(plan.id);
    const snapshot = repository.load(plan.id)!;
    window.localStorage.setItem(`roadbook.route-plan.v1.${plan.id}`, JSON.stringify({ ...snapshot, thumbnail: { paths: "bad" } }));
    const summaries = repository.list();
    window.localStorage.setItem("roadbook.route-plan-catalog.v1", JSON.stringify([{ ...summaries[0], thumbnail: { paths: "bad" } }]));
    const getItem = vi.spyOn(window.localStorage, "getItem");
    expect(repository.list()[0].thumbnail).toBeUndefined();
    expect(getItem).toHaveBeenCalledExactlyOnceWith("roadbook.route-plan-catalog.v1");
    expect(repository.load(plan.id)?.controlPoints).toEqual(plan.controlPoints);
    expect(repository.load(plan.id)?.thumbnail).toBeUndefined();
  });
  it("补存失败保留待保存轮廓，重试成功且删除清理摘要与快照", () => {
    const { session, persistence, repository, plan } = setup();
    session.captureThumbnail(publish(plan));
    const save = vi.spyOn(repository, "save").mockImplementationOnce(() => { throw new Error("存储已满"); });
    expect(persistence.flush(plan.id)).toBe(false);
    expect(persistence.hasPending(plan.id)).toBe(true);
    expect(session.state.getState().activePlan?.thumbnail).toBeDefined();
    save.mockRestore();
    expect(persistence.flush(plan.id)).toBe(true);
    session.delete(plan.id);
    expect(repository.load(plan.id)).toBeNull();
    expect(repository.list()).toEqual([]);
  });
  it("真实算路流程发布后补存不会引起反馈重算，切换返程不替换单程轮廓", async () => {
    const { session, persistence, plan } = setup();
    const returning = makeRoute([[...coordinates].reverse()]);
    returning.legs[0].fromControlPointId = "end";
    returning.legs[0].toControlPointId = "start";
    const calculateDrivingRoute = vi.fn(async () => makeRoute()).mockResolvedValueOnce(makeRoute()).mockResolvedValueOnce(returning);
    const adapter = { calculateDrivingRoute } as unknown as WebMapAdapter;
    const actor = createRouteCalculationActor();
    const syncInput = () => actor.send({ type: "INPUT", input: {
      plan: session.state.getState().activePlan, activation: 1, provider: "amap", adapter, connection: "ready",
    } });
    const observer = actor.subscribe((snapshot) => session.captureThumbnail(queryRouteCalculation(snapshot).published));
    const unsubscribe = session.state.subscribe((next, previous) => {
      if (next.activePlan !== previous.activePlan) syncInput();
    });
    actor.start();
    try {
      syncInput();
      await vi.advanceTimersByTimeAsync(1000);
      expect(calculateDrivingRoute).toHaveBeenCalledTimes(1);
      expect(queryRouteCalculation(actor.getSnapshot()).routeStatus).toBe("ready");
      const thumbnail = session.state.getState().activePlan?.thumbnail;
      expect(thumbnail).toBeDefined();
      expect(new LocalRoutePlanRepository().list()[0].thumbnail).toEqual(thumbnail);
      actor.send({ type: "TOGGLE_RETURN" });
      await vi.advanceTimersByTimeAsync(1000);
      expect(calculateDrivingRoute).toHaveBeenCalledTimes(2);
      expect(queryRouteCalculation(actor.getSnapshot()).includeReturn).toBe(true);
      expect(session.state.getState().activePlan?.thumbnail).toBe(thumbnail);
      expect(session.state.getState().activePlan?.revision).toBe(plan.revision);
    } finally { unsubscribe(); observer.unsubscribe(); actor.stop(); persistence.dispose(); }
  });
});
