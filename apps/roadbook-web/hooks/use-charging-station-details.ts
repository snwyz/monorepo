"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChargingStationDetailsResult } from "@/domain/route-charging/model";
import { getCachedChargingStationDetails, queryChargingStationDetails } from "@/infrastructure/route-charging/route-charging-client";

export function useChargingStationDetails(stationId: string) {
  const [attempt, setAttempt] = useState(0);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const [snapshot, setSnapshot] = useState<{ id: string; attempt: number; result: ChargingStationDetailsResult | null; error: string | null } | null>(null);
  const retry = useCallback(() => { setCheckedAt(Date.now()); setAttempt((value) => value + 1); }, []);
  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;
    let timeout: number | undefined;
    let requestVersion = 0;
    const refresh = async (force = false) => {
      const version = ++requestVersion;
      controller?.abort();
      window.clearTimeout(timeout);
      controller = new AbortController();
      const signal = controller.signal;
      const activeController = controller;
      const requestTimeout = window.setTimeout(() => activeController.abort(), 20_000);
      timeout = requestTimeout;
      try {
        const result = await queryChargingStationDetails(stationId, signal, force);
        if (!disposed && version === requestVersion && !signal.aborted) setSnapshot({ id: stationId, attempt, result, error: null });
      } catch {
        if (!disposed && version === requestVersion) setSnapshot({ id: stationId, attempt, result: null, error: "暂时无法更新桩位" });
      } finally { window.clearTimeout(requestTimeout); }
    };
    if (!document.hidden) void refresh(attempt > 0);
    const interval = window.setInterval(() => { if (!document.hidden) { setCheckedAt(Date.now()); void refresh(); } }, 30_000);
    const resume = () => { if (!document.hidden) { setCheckedAt(Date.now()); void refresh(); } };
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true; controller?.abort(); window.clearTimeout(timeout);
      window.clearInterval(interval); document.removeEventListener("visibilitychange", resume);
    };
  }, [stationId, attempt]);
  const current = snapshot?.id === stationId && snapshot.attempt === attempt ? snapshot : null;
  const result = current?.result ?? getCachedChargingStationDetails(stationId);
  const stale = Boolean(result && (Date.parse(result.fetchedAt) + 30_000 <= checkedAt || current?.error));
  return { result, stale, error: current?.error ?? null, loading: !current, retry };
}
