import type { RoutePlan, RoutePlanSummary } from "./model";

export interface RoutePlanRepository {
  list(): RoutePlanSummary[];
  load(id: string): RoutePlan | null;
  save(plan: RoutePlan): void;
  delete(id: string): void;
  clearAll(): void;
}
