import type { RouteElevationRange } from "../../domain/elevation-analysis/model";

// 刻度只影响展示，不改变道路距离、采样或领域统计。
function roundedStep(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  return (normalized <= 1 + 1e-10 ? 1 : normalized <= 2 + 1e-10 ? 2 : normalized <= 5 + 1e-10 ? 5 : 10) * magnitude;
}

function alignedTicks(start: number, end: number, step: number): number[] {
  const first = Math.ceil(start / step - 1e-10);
  const last = Math.floor(end / step + 1e-10);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => Number(((first + index) * step).toPrecision(12)));
}

export function buildRouteDistanceAxis(range: RouteElevationRange, plotWidth: number) {
  const span = range.endMeters - range.startMeters;
  if (!Number.isFinite(span) || !Number.isFinite(range.startMeters) || span <= 0) {
    return { minorStepMeters: 0, labelStepMeters: 0, minorTicks: [], labelTicks: [] };
  }
  const minorStepMeters = roundedStep(span / 25);
  const intervals = Math.max(1, Math.min(5, Math.floor(plotWidth / 44) || 1));
  const labelStepMeters = minorStepMeters * roundedStep(Math.max(1, span / minorStepMeters / intervals));
  return {
    minorStepMeters,
    labelStepMeters,
    minorTicks: alignedTicks(range.startMeters, range.endMeters, minorStepMeters),
    labelTicks: alignedTicks(range.startMeters, range.endMeters, labelStepMeters),
  };
}

export function formatRouteDistanceTick(meters: number, stepMeters: number): string {
  const decimals = Math.max(0, Math.min(6, Math.ceil(-Math.log10(stepMeters / 1000))));
  return String(Number((meters / 1000).toFixed(decimals)));
}

export function buildRouteElevationAxis(lowest: number, highest: number) {
  const padding = Math.max(25, (highest - lowest) * 0.12);
  let step = roundedStep((highest - lowest + padding * 2) / 3);
  let start = Math.floor((lowest - padding) / step) * step;
  let end = Math.ceil((highest + padding) / step) * step;
  // 向外留白后仍最多保留四条水平刻度，平坦与负海拔不强制从零开始。
  if (Math.round((end - start) / step) > 3) {
    step = roundedStep(step * 1.01);
    start = Math.floor((lowest - padding) / step) * step;
    end = Math.ceil((highest + padding) / step) * step;
  }
  return { domain: [start, end], ticks: alignedTicks(start, end, step) };
}
