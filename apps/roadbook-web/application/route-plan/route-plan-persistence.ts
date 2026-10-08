import { createStore } from "zustand/vanilla";
import type { DraftStatus, RoutePlan } from "@/domain/route-planning/model";
import type { RoutePlanRepository } from "@/domain/route-planning/repository";

interface SaveReceipt {
  planId: string | null;
  revision: number | null;
  status: DraftStatus;
}

// 同步仓储的待保存快照独立于活动方案和 React Effect 生命周期。
export function createRoutePlanPersistence(repository: RoutePlanRepository, delay = 360) {
  const state = createStore<SaveReceipt>(() => ({ planId: null, revision: null, status: "idle" }));
  const pending = new Map<string, RoutePlan>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const clearTimer = (id: string) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
  };
  const flush = (id: string) => {
    clearTimer(id);
    const plan = pending.get(id);
    if (!plan) return true;
    try {
      repository.save(plan);
      // 回执只能确认它实际保存的快照。
      if (pending.get(id) === plan) {
        pending.delete(id);
        state.setState({ planId: id, revision: plan.revision, status: "saved" });
      }
      return true;
    } catch {
      state.setState({ planId: id, revision: plan.revision, status: "failed" });
      return false;
    }
  };
  const schedule = (plan: RoutePlan) => {
    const previous = pending.get(plan.id);
    if (previous && previous.revision > plan.revision) return;
    pending.set(plan.id, plan);
    clearTimer(plan.id);
    state.setState({ planId: plan.id, revision: plan.revision, status: "saving" });
    timers.set(plan.id, setTimeout(() => flush(plan.id), delay));
  };
  const discard = (id: string) => {
    clearTimer(id);
    pending.delete(id);
    if (state.getState().planId === id) {
      state.setState({ planId: null, revision: null, status: "idle" });
    }
  };
  return {
    state, schedule, flush, discard,
    hasPending: (id: string) => pending.has(id),
    dispose() {
      for (const id of pending.keys()) flush(id);
    },
  };
}

export type RoutePlanPersistence = ReturnType<typeof createRoutePlanPersistence>;
