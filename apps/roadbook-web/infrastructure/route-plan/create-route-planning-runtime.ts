import { AmapWebAdapter, TencentMapWebAdapter } from "@roadbook/map/web";
import { createMapConnection } from "@/application/map-platform/map-connection";
import { createRouteCalculationActor, queryRouteCalculation } from "@/application/route-calculation/route-calculation-actor";
import { createRoutePlanPersistence } from "@/application/route-plan/route-plan-persistence";
import { createRoutePlanSession } from "@/application/route-plan/route-plan-session";
import { LocalRoutePlanRepository } from "./local-route-plan-repository";

// 装配只连接能力，不承载编辑、保存或算路规则。
export function createRoutePlanningRuntime() {
  const repository = new LocalRoutePlanRepository();
  const persistence = createRoutePlanPersistence(repository);
  const session = createRoutePlanSession(repository, persistence);
  const map = createMapConnection((provider) => provider === "amap"
    ? AmapWebAdapter.create({ key: process.env.NEXT_PUBLIC_AMAP_KEY ?? "" })
    : TencentMapWebAdapter.create({ key: process.env.NEXT_PUBLIC_TENCENT_MAP_KEY ?? "" }));
  let actor = createRouteCalculationActor();
  const listeners = new Set<() => void>();
  let cleanup = () => {};
  const calculation = {
    getSnapshot: () => actor.getSnapshot(),
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    send: (event: Parameters<typeof actor.send>[0]) => actor.send(event),
  };
  return {
    session, persistence, map, calculation,
    start() {
      // Effect 重挂载创建新流程，避免复用已经停止的 actor。
      actor = createRouteCalculationActor();
      const observer = actor.subscribe((snapshot) => {
        session.captureThumbnail(queryRouteCalculation(snapshot).published);
        listeners.forEach((listener) => listener());
      });
      actor.start();
      const syncInput = () => {
        const { activePlan, activation } = session.state.getState();
        const { provider, adapter, status } = map.state.getState();
        actor.send({ type: "INPUT", input: { plan: activePlan, activation, provider, adapter, connection: status } });
      };
      const unsubscribePlan = session.state.subscribe((next, previous) => {
        if (next.activePlan !== previous.activePlan || next.activation !== previous.activation) syncInput();
      });
      const unsubscribeMap = map.state.subscribe(syncInput);
      const unsubscribeSave = persistence.state.subscribe((receipt) => {
        if (receipt.status === "saved") session.refreshCatalog();
      });
      session.refreshCatalog();
      syncInput();
      map.select(map.state.getState().provider);
      const flushActive = () => {
        const plan = session.state.getState().activePlan;
        if (plan) persistence.flush(plan.id);
      };
      window.addEventListener("pagehide", flushActive);
      cleanup = () => {
        window.removeEventListener("pagehide", flushActive);
        persistence.dispose();
        unsubscribePlan(); unsubscribeMap(); unsubscribeSave();
        observer.unsubscribe(); actor.stop(); map.dispose();
      };
    },
    dispose: () => cleanup(),
  };
}
