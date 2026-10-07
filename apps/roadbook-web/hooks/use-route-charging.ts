"use client";

import type { DrivingRoute } from "@roadbook/map/web";
import { useCallback, useEffect, useState } from "react";
import type { WholeRouteChargingResult } from "@/domain/route-charging/model";

interface Snapshot {
  route: DrivingRoute;
  revision: number;
  scope: string;
  attempt: number;
  result: WholeRouteChargingResult | null;
  error: string | null;
}

export function useRouteCharging(route: DrivingRoute | null, scope: string, revision: number, enabled: boolean, ready: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selection, setSelection] = useState<{ scope: string; id: string } | null>(null);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!route || !enabled || !ready) return;
    const controller = new AbortController();
    let disposed = false;
    const timeout = window.setTimeout(() => controller.abort(), 60_000);
    void import("@/infrastructure/route-charging/route-charging-client")
      .then(({ queryWholeRouteChargingStations }) => queryWholeRouteChargingStations(route.legs, controller.signal))
      .then((result) => {
        if (!disposed) setSnapshot({ route, revision, scope, attempt, result, error: null });
      })
      .catch((error: unknown) => {
        if (!disposed) setSnapshot((previous) => ({ route, revision, scope, attempt,
          result: previous?.scope === scope ? previous.result : null,
          error: controller.signal.aborted ? "站点查询超时，请重试" : error instanceof Error ? error.message : "站点查询失败",
        }));
        controller.abort();
      })
      .finally(() => window.clearTimeout(timeout));
    return () => { disposed = true; controller.abort(); window.clearTimeout(timeout); };
  }, [route, revision, scope, enabled, ready, attempt]);

  const visible = enabled && snapshot?.scope === scope ? snapshot : null;
  const current = ready && visible?.route === route && visible.revision === revision && visible.attempt === attempt ? visible : null;
  const result = visible?.result ?? null;
  const selectedStation = enabled && selection?.scope === scope
    ? result?.stations.find((station) => station.id === selection.id) ?? null : null;
  const selectStation = useCallback((id: string | null) => setSelection(id ? { scope, id } : null), [scope]);
  return {
    result, selectedStation, selectStation, retry,
    error: current?.error ?? null,
    loading: Boolean(enabled && ready && route && !current),
    current: Boolean(current?.result && !current.error),
  };
}
