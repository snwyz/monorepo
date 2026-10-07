import { clipSamples, isContinuous, isKnown, simplifyChartSamples } from "../../domain/elevation-analysis/analyze";
import type { ElevationRangeSummary, ElevationSample, RouteElevationRange, SustainedSlopeSection } from "../../domain/elevation-analysis/model";

export interface RouteElevationChartPoint {
  distanceMeters: number;
  heightMeters: number | null;
  sample: ElevationSample | null;
  section: SustainedSlopeSection | null;
}

// Recharts 只消费展示数据；未知与道路断点保留空值，图表在展示层连接有效点，统计仍使用完整分析样本。
export function buildRouteElevationChartData(samples: ElevationSample[], range: RouteElevationRange, sections: SustainedSlopeSection[], summary: ElevationRangeSummary): RouteElevationChartPoint[] {
  const clipped = clipSamples(samples, range);
  const important = [...sections.flatMap((section) => [section.startMeters, section.endMeters]), ...[summary.highest, summary.lowest].flatMap((sample) => sample ? [sample.distanceMeters] : [])];
  const data: RouteElevationChartPoint[] = [];
  let run: ElevationSample[] = [];
  const flush = () => {
    data.push(...simplifyChartSamples(run, important).map((sample) => ({ distanceMeters: sample.distanceMeters, heightMeters: sample.elevationMeters, sample, section: sections.find((section) => section.startMeters <= sample.distanceMeters && section.endMeters >= sample.distanceMeters) ?? null })));
    run = [];
  };
  clipped.forEach((sample, index) => {
    const previous = clipped[index - 1];
    if (previous && !isContinuous(previous, sample)) {
      flush();
      // 两侧均有海拔但道路不连续时仍保留显式空值，供读数区分视觉连接与有效数据。
      if (isKnown(previous) && isKnown(sample)) data.push({ distanceMeters: (previous.distanceMeters + sample.distanceMeters) / 2, heightMeters: null, sample: null, section: null });
    }
    if (isKnown(sample)) run.push(sample);
    else data.push({ distanceMeters: sample.distanceMeters, heightMeters: null, sample, section: null });
  });
  flush();
  return data;
}
