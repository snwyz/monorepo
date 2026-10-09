import { normalizeRoutePlanStrategy } from "@/domain/route-planning/model";
import { normalizeRouteLegTravelModes } from "@/domain/route-planning/route-leg-travel-mode";
import type {
  RoutePlan,
  RoutePlanSummary,
} from "@/domain/route-planning/model";
import type { RoutePlanRepository } from "@/domain/route-planning/repository";
import { getRoutePlanThumbnail, isRoutePlanThumbnail } from "@/domain/route-planning/route-plan-thumbnail";

const CATALOG_KEY = "roadbook.route-plan-catalog.v1";
const SNAPSHOT_PREFIX = "roadbook.route-plan.v1.";

function isRoutePlan(value: unknown): value is RoutePlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<RoutePlan>;
  return (
    plan.schemaVersion === 1 &&
    typeof plan.id === "string" &&
    typeof plan.name === "string" &&
    typeof plan.revision === "number" &&
    Array.isArray(plan.controlPoints)
  );
}

function isSummary(value: unknown): value is RoutePlanSummary {
  if (!value || typeof value !== "object") return false;
  const summary = value as Partial<RoutePlanSummary>;
  return (
    summary.schemaVersion === 1 &&
    typeof summary.id === "string" &&
    typeof summary.name === "string" &&
    typeof summary.controlPointCount === "number" &&
    typeof summary.updatedAt === "string" &&
    (summary.startPointName === undefined || typeof summary.startPointName === "string") &&
    (summary.lastControlPointName === undefined || typeof summary.lastControlPointName === "string")
  );
}

export class LocalRoutePlanRepository implements RoutePlanRepository {
  list(): RoutePlanSummary[] {
    try {
      const raw = window.localStorage.getItem(CATALOG_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(isSummary)
        .map((summary) => ({
          ...summary,
          thumbnail: isRoutePlanThumbnail(summary.thumbnail) ? summary.thumbnail : undefined,
          loadable: summary.loadable !== false,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch {
      return [];
    }
  }

  load(id: string): RoutePlan | null {
    try {
      const raw = window.localStorage.getItem(`${SNAPSHOT_PREFIX}${id}`);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!isRoutePlan(parsed)) return null;
      const plan = { ...parsed, strategy: normalizeRoutePlanStrategy(parsed.strategy) };
      plan.legTravelModes = normalizeRouteLegTravelModes(plan);
      if (plan.thumbnail !== undefined) plan.thumbnail = getRoutePlanThumbnail(plan);
      return plan;
    } catch {
      return null;
    }
  }

  save(plan: RoutePlan) {
    const thumbnail = getRoutePlanThumbnail(plan);
    window.localStorage.setItem(`${SNAPSHOT_PREFIX}${plan.id}`, JSON.stringify({ ...plan, thumbnail }));
    const summary: RoutePlanSummary = {
      id: plan.id,
      name: plan.name,
      controlPointCount: plan.controlPoints.length,
      startPointName: plan.controlPoints[0]?.name.trim() || undefined,
      lastControlPointName: plan.controlPoints.length > 1
        ? plan.controlPoints[plan.controlPoints.length - 1]?.name.trim() || undefined
        : undefined,
      updatedAt: plan.updatedAt,
      schemaVersion: 1,
      loadable: true,
      thumbnail,
    };
    const catalog = this.list().filter((item) => item.id !== plan.id);
    window.localStorage.setItem(CATALOG_KEY, JSON.stringify([summary, ...catalog]));
  }

  delete(id: string) {
    window.localStorage.removeItem(`${SNAPSHOT_PREFIX}${id}`);
    const catalog = this.list().filter((item) => item.id !== id);
    window.localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
  }

  clearAll() {
    const snapshotKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(SNAPSHOT_PREFIX)) snapshotKeys.push(key);
    }
    snapshotKeys.forEach((key) => window.localStorage.removeItem(key));
    window.localStorage.removeItem(CATALOG_KEY);
  }
}
