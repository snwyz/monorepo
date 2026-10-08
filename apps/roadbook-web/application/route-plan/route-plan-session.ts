import { createStore } from "zustand/vanilla";
import { reviseRoutePlan, type RoutePlan, type RoutePlanSummary } from "@/domain/route-planning/model";
import type { RoutePlanRepository } from "@/domain/route-planning/repository";
import type { RoutePlanPersistence } from "./route-plan-persistence";

interface RoutePlanSessionState {
  activePlan: RoutePlan | null;
  history: RoutePlan[];
  catalog: RoutePlanSummary[];
  catalogReady: boolean;
  activation: number;
}

export function createRoutePlanSession(repository: RoutePlanRepository, persistence: RoutePlanPersistence) {
  const state = createStore<RoutePlanSessionState>(() => ({
    activePlan: null, history: [], catalog: [], catalogReady: false, activation: 0,
  }));
  const refreshCatalog = () => state.setState({ catalog: repository.list(), catalogReady: true });
  const handoff = () => {
    const current = state.getState().activePlan;
    return !current || persistence.flush(current.id);
  };
  const activate = (plan: RoutePlan, save: boolean) => {
    if (!handoff()) return false;
    state.setState((current) => ({ activePlan: plan, history: [], activation: current.activation + 1 }));
    if (save) persistence.schedule(plan);
    return true;
  };
  const edit = (change: (plan: RoutePlan) => RoutePlan, recordHistory = true) => {
    const { activePlan, history } = state.getState();
    if (!activePlan) return null;
    const changed = change(activePlan);
    if (changed === activePlan) return null;
    const next = reviseRoutePlan(activePlan, () => changed);
    state.setState({ activePlan: next, history: recordHistory ? [...history.slice(-19), activePlan] : history });
    persistence.schedule(next);
    return next;
  };
  const reset = () => state.setState((current) => ({ activePlan: null, history: [], activation: current.activation + 1 }));
  return {
    state, refreshCatalog, edit,
    create: (plan: RoutePlan) => activate(plan, true),
    load(id: string) {
      // 同一活动方案重新加载也不能读回尚未暂存的旧内容。
      if (state.getState().activePlan?.id === id && !handoff()) return null;
      const plan = repository.load(id);
      if (!plan) {
        state.setState((current) => ({ catalog: current.catalog.map((item) => item.id === id ? { ...item, loadable: false } : item) }));
        return null;
      }
      return activate(plan, false) ? plan : null;
    },
    undo() {
      const { activePlan, history } = state.getState();
      const previous = history[history.length - 1];
      if (!activePlan || !previous) return;
      const restored = reviseRoutePlan(activePlan, () => previous);
      state.setState({ activePlan: restored, history: history.slice(0, -1) });
      persistence.schedule(restored);
    },
    delete(id: string) {
      const current = state.getState().activePlan;
      persistence.discard(id);
      try { repository.delete(id); }
      catch (error) { if (current?.id === id) persistence.schedule(current); throw error; }
      if (current?.id === id) reset();
      refreshCatalog();
    },
    clear() {
      const current = state.getState().activePlan;
      if (current) persistence.discard(current.id);
      try { repository.clearAll(); }
      catch (error) { if (current) persistence.schedule(current); throw error; }
      reset();
      refreshCatalog();
    },
  };
}
