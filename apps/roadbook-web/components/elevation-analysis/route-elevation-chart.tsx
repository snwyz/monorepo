"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MapCoordinate } from "@roadbook/map/web";
import type { ElevationRangeSummary, ElevationSample, RouteElevationRange, SustainedSlopeSection } from "@/domain/elevation-analysis/model";
import { buildRouteElevationChartData, type RouteElevationChartPoint } from "./route-elevation-chart-data";
import { elevation, grade, kilometers } from "./elevation-format";
import { buildRouteDistanceAxis, buildRouteElevationAxis, formatRouteDistanceTick } from "./route-elevation-chart-axis";

interface ChartProps {
  samples: ElevationSample[];
  range: RouteElevationRange;
  summary: ElevationRangeSummary;
  sections: SustainedSlopeSection[];
  onBrowse: (coordinate: MapCoordinate | null) => void;
}

const renderDistanceMinorTick = () => <g aria-hidden="true" />;

function ElevationChartTooltip({ active, payload, onBrowse }: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: RouteElevationChartPoint }>;
  onBrowse: ChartProps["onBrowse"];
}) {
  const point = payload?.[0]?.payload;
  const coordinate = active && point?.heightMeters !== null ? point?.sample?.coordinate ?? null : null;
  useEffect(() => {
    const frame = requestAnimationFrame(() => onBrowse(coordinate));
    return () => cancelAnimationFrame(frame);
  }, [coordinate, onBrowse]);
  useEffect(() => () => onBrowse(null), [onBrowse]);
  if (!active || !point) return null;
  const section = point.heightMeters !== null ? point.section : null;
  return <div className="elevation-chart__tooltip" role="status" aria-live="polite" aria-atomic="true">
    <span>第 {kilometers(point.distanceMeters)} 公里</span>
    <strong>{point.heightMeters === null ? "高程不可用" : `海拔约 ${elevation(point.heightMeters)}`}</strong>
    {section ? <span>{section.direction === "ascent" ? "↑ 长上坡" : "↓ 长下坡"} {kilometers(section.lengthMeters)}km · 平均 {grade(section.averageGradePercent)}</span> : null}
  </div>;
}

export function RouteElevationChart({ samples, range, summary, sections, onBrowse }: ChartProps) {
  const gradientId = useId();
  const [plotWidth, setPlotWidth] = useState(240);
  const data = useMemo(() => buildRouteElevationChartData(samples, range, sections, summary), [samples, range, sections, summary]);
  const lowest = summary.lowest?.elevationMeters ?? 0;
  const highest = summary.highest?.elevationMeters ?? 50;
  const elevationAxis = buildRouteElevationAxis(lowest, highest);
  const distanceAxis = buildRouteDistanceAxis(range, plotWidth);
  // 两轴从零开始时共用横轴原点标签，网格与真实坐标范围保持不变。
  const shareOriginLabel = range.startMeters === 0 && elevationAxis.domain[0] === 0;
  const flat = highest === lowest;
  const extrema = flat ? [summary.highest] : [summary.highest, summary.lowest];
  const middle = (range.startMeters + range.endMeters) / 2;
  return <div className="elevation-chart" onMouseLeave={() => onBrowse(null)} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) onBrowse(null);
  }}>
    <span className="sr-only">道路里程与估算地表海拔，使用左右方向键浏览。{summary.coverage < 0.999 ? "缺口连接为视觉过渡，最高最低点仅代表有效数据区间。" : ""}
      {sections.map((section) => `${section.direction === "ascent" ? "上坡" : "下坡"}：第${kilometers(section.startMeters)}至${kilometers(section.endMeters)}公里，长${kilometers(section.lengthMeters)}公里，平均坡度${grade(section.averageGradePercent)}。`).join(" ")}
    </span>
    <ResponsiveContainer width="100%" height="100%" minWidth={0} onResize={(width) => setPlotWidth(Math.max(0, width - 68))}>
      <AreaChart data={data} margin={{ top: 30, right: 16, bottom: 4, left: 8 }} accessibilityLayer>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--rb-color-elevation-fill)" stopOpacity={0.22} />
          <stop offset="100%" stopColor="var(--rb-color-elevation-fill)" stopOpacity={0.015} />
        </linearGradient></defs>
        <CartesianGrid vertical={false} stroke="var(--rb-color-border)" strokeOpacity={0.5} />
        <XAxis xAxisId="distance-marks" dataKey="distanceMeters" type="number" domain={[range.startMeters, range.endMeters]} ticks={distanceAxis.minorTicks} tick={renderDistanceMinorTick} tickLine={{ stroke: "var(--rb-color-border)" }} tickSize={3} axisLine={false} height={4} interval={0} />
        <XAxis dataKey="distanceMeters" type="number" domain={[range.startMeters, range.endMeters]} ticks={distanceAxis.labelTicks} tickFormatter={(value: number) => formatRouteDistanceTick(value, distanceAxis.labelStepMeters)} tickLine={false} axisLine={false} tickMargin={10} height={30} interval={0} />
        <YAxis type="number" domain={elevationAxis.domain} ticks={elevationAxis.ticks} tickFormatter={(value: number) => shareOriginLabel && value === 0 ? "" : String(Math.round(value))} tickLine={false} axisLine={false} width={44} tickMargin={8} interval={0} />
        {sections.map((section) => <ReferenceArea key={section.id} x1={section.startMeters} x2={section.endMeters} fill="var(--rb-color-text)" fillOpacity={0.035} strokeOpacity={0} />)}
        <Tooltip filterNull={false} isAnimationActive={false} cursor={{ stroke: "var(--rb-color-muted)", strokeDasharray: "3 3" }} content={<ElevationChartTooltip onBrowse={onBrowse} />} />
        <Area type="monotoneX" dataKey="heightMeters" baseValue={elevationAxis.domain[0]} connectNulls stroke="var(--rb-color-elevation-line)" strokeWidth={2} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 3.5, strokeWidth: 2, stroke: "var(--rb-color-surface)", fill: "var(--rb-color-elevation-line)" }} isAnimationActive={false} />
        {extrema.map((sample, index) => sample && <ReferenceDot key={index} x={sample.distanceMeters} y={sample.elevationMeters!} r={3} fill="var(--rb-color-elevation-line)" stroke="var(--rb-color-surface)" label={{ value: `${flat ? "海拔" : index === 0 ? "最高" : "最低"} ${elevation(sample.elevationMeters)}`, position: sample.distanceMeters > middle ? "left" : "right", dy: index === 0 ? -12 : 12, offset: 8, fontSize: 11, fill: "var(--rb-color-text)" }} />)}
      </AreaChart>
    </ResponsiveContainer>
    <span className="elevation-chart__unit elevation-chart__unit--height" aria-hidden="true">海拔 m</span>
    <span className="elevation-chart__unit elevation-chart__unit--distance" aria-hidden="true">km</span>
  </div>;
}
