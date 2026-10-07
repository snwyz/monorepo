import type { ElevationRangeSummary as Summary } from "@/domain/elevation-analysis/model";
import { elevation, kilometers } from "./elevation-format";

export function ElevationRangeSummary({ summary }: { summary: Summary }) {
  return <div className="elevation-summary" aria-label="当前区间估算指标">
    <div className="elevation-summary__primary"><span>↑ 累计爬升 <strong>{elevation(summary.ascentMeters)}</strong></span><span>↓ 累计下降 <strong>{elevation(summary.descentMeters)}</strong></span></div>
    <p>{summary.coverage < 0.999 ? `仅统计已覆盖区间 · 覆盖${Math.round(summary.coverage * 100)}%` : "地表高程估算 · 完整覆盖"}</p>
    <details><summary>最高 / 最低与净高差</summary>
      <p>{summary.coverage < 0.999 ? "已覆盖区间" : "区间"}最高 {elevation(summary.highest?.elevationMeters ?? null)} · 第{summary.highest ? kilometers(summary.highest.distanceMeters) : "—"}公里</p>
      <p>{summary.coverage < 0.999 ? "已覆盖区间" : "区间"}最低 {elevation(summary.lowest?.elevationMeters ?? null)} · 第{summary.lowest ? kilometers(summary.lowest.distanceMeters) : "—"}公里</p>
      <p>净高差 {elevation(summary.netHeightMeters)}</p>
    </details>
  </div>;
}
