import type { SustainedSlopeSection } from "@/domain/elevation-analysis/model";
import { elevation, grade, kilometers } from "./elevation-format";

export function SlopeSectionDetails({ section, index, total, onPrevious, onNext, onDirectory, onView }: {
  section: SustainedSlopeSection | null; index: number; total: number;
  onPrevious: () => void; onNext: () => void; onDirectory: () => void; onView: () => void;
}) {
  if (!section) return <div className="elevation-slope-details"><button type="button" onClick={onDirectory}>按行驶顺序查看 {total} 个重点坡段</button></div>;
  return <div className="elevation-slope-details">
    <div className="elevation-slope-details__heading"><strong>{section.direction === "ascent" ? "↑ 持续上坡" : "↓ 持续下坡"}</strong><div><button type="button" aria-label="上一个坡段" disabled={index <= 0} onClick={onPrevious}>‹</button><button type="button" aria-label="打开坡段目录" onClick={onDirectory}>{index + 1}/{total}</button><button type="button" aria-label="下一个坡段" disabled={index >= total - 1} onClick={onNext}>›</button></div></div>
    <p>第{kilometers(section.startMeters)}–{kilometers(section.endMeters)}公里 · 长{kilometers(section.lengthMeters)}km</p>
    <p>净{section.netHeightMeters >= 0 ? "升" : "降"}{elevation(Math.abs(section.netHeightMeters))} · 平均坡度 {grade(section.averageGradePercent)}</p>
    <details><summary>坡段指标与质量</summary><p>起止海拔 {elevation(section.startElevationMeters)} → {elevation(section.endElevationMeters)}</p><p>段内累计 ↑ {elevation(section.ascentMeters)} / ↓ {elevation(section.descentMeters)}</p>
      {section.localGrade ? <p>局部持续坡度（500m）{grade(section.localGrade.percent)} · 第{kilometers(section.localGrade.startMeters)}–{kilometers(section.localGrade.endMeters)}公里</p> : <p>坡段不足500m，局部窗口不可用</p>}
      {section.trendGrade ? <p>趋势坡度（2km）{grade(section.trendGrade.percent)} · 第{kilometers(section.trendGrade.startMeters)}–{kilometers(section.trendGrade.endMeters)}公里</p> : null}
      <p>地表估算 · 试验算法，非道路安全等级</p></details>
    <button type="button" onClick={onView}>查看此段</button>
  </div>;
}
