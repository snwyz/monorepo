"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { MapCoordinate } from "@roadbook/map/web";
import { clipSamples, isContinuous, isKnown, simplifyChartSamples } from "@/domain/elevation-analysis/analyze";
import { findPosition } from "@/domain/elevation-analysis/geometry";
import type { ElevationControlPoint, ElevationSample, RouteElevationRange, SustainedSlopeSection } from "@/domain/elevation-analysis/model";
import { elevation, kilometers } from "./elevation-format";

interface ChartProps {
  samples: ElevationSample[];
  controlPoints: ElevationControlPoint[];
  range: RouteElevationRange;
  selection: RouteElevationRange;
  selecting: boolean;
  sections: SustainedSlopeSection[];
  selected: SustainedSlopeSection | null;
  onCommitRange: (range: RouteElevationRange) => boolean;
  onSelectSection: (id: string) => void;
  onBrowse: (coordinate: MapCoordinate | null) => void;
}
function ElevationChartRangeHandle({ endpoint, x, range, value, onKey }: {
  endpoint: "startMeters" | "endMeters"; x: number; range: RouteElevationRange; value: number;
  onKey: (event: KeyboardEvent<SVGGElement>, endpoint: "startMeters" | "endMeters") => void;
}) {
  return <g data-endpoint={endpoint} role="slider" tabIndex={0} aria-label={endpoint === "startMeters" ? "选区起点" : "选区终点"} aria-valuemin={range.startMeters} aria-valuemax={range.endMeters} aria-valuenow={value} aria-valuetext={`第${kilometers(value)}公里`} onKeyDown={(event) => onKey(event, endpoint)}>
    <rect x={x - 22} y="0" width="44" height="88" fill="transparent" /><line x1={x} x2={x} y1="4" y2="84" className="elevation-chart__handle" /><rect x={x - 4} y="36" width="8" height="16" rx="3" className="elevation-chart__handle-grip" />
  </g>;
}
export function RouteElevationChart(props: ChartProps) {
  const { samples, controlPoints, range, selection, selecting, sections, selected, onBrowse } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const selectionClipId = useId();
  const [cursor, setCursor] = useState<number | null>(null);
  const [draft, setDraft] = useState<RouteElevationRange | null>(null);
  const draftRef = useRef<RouteElevationRange | null>(null);
  const drag = useRef<{ endpoint: "startMeters" | "endMeters"; original: RouteElevationRange } | null>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const schedule = (callback: () => void) => {
    pending.current = callback;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => { frame.current = null; pending.current?.(); pending.current = null; });
  };
  const cancelFrame = () => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; pending.current = null; };
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); onBrowse(null); }, [onBrowse]);
  const chart = useMemo(() => {
    const clipped = clipSamples(samples, range);
    const known = clipped.filter(isKnown);
    const minimum = known.reduce((value, sample) => Math.min(value, sample.elevationMeters!), Infinity);
    const maximum = known.reduce((value, sample) => Math.max(value, sample.elevationMeters!), -Infinity);
    const min = Number.isFinite(minimum) ? Math.floor(minimum / 50) * 50 : 0;
    const max = Number.isFinite(maximum) ? Math.max(min + 50, Math.ceil(maximum / 50) * 50) : 50;
    const x = (distance: number) => 44 + (distance - range.startMeters) / (range.endMeters - range.startMeters) * 260;
    const y = (height: number) => 74 - (height - min) / (max - min) * 60;
    const runs: ElevationSample[][] = [];
    const unknown: RouteElevationRange[] = [];
    let run: ElevationSample[] = [];
    clipped.forEach((sample, index) => {
      const previous = clipped[index - 1];
      if (previous && !isContinuous(previous, sample)) {
        if (run.length) runs.push(run); run = [];
        const last = unknown[unknown.length - 1];
        if (last?.endMeters === previous.distanceMeters) last.endMeters = sample.distanceMeters;
        else unknown.push({ startMeters: previous.distanceMeters, endMeters: sample.distanceMeters });
      }
      if (isKnown(sample)) run.push(sample);
    });
    if (run.length) runs.push(run);
    const important = [...controlPoints.map((point) => point.distanceMeters), ...sections.flatMap((section) => [section.startMeters, section.endMeters])];
    const paths = runs.map((points) => simplifyChartSamples(points, important).map((point, index) => `${index ? "L" : "M"}${x(point.distanceMeters).toFixed(2)},${y(point.elevationMeters!).toFixed(2)}`).join(" "));
    return { x, y, min, max, paths, unknown };
  }, [samples, range, controlPoints, sections]);
  const active = cursor === null ? null : samples[cursor];
  const visibleActive = active && active.distanceMeters >= range.startMeters && active.distanceMeters <= range.endMeters ? active : null;
  const displaySelection = draft ?? selection;
  const emphasizedRange = selecting ? displaySelection : selected;
  const distanceFromPointer = (event: { clientX: number; currentTarget: SVGSVGElement }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(range.startMeters, Math.min(range.endMeters, range.startMeters + ((event.clientX - rect.left) / rect.width * 320 - 44) / 260 * (range.endMeters - range.startMeters)));
  };
  const browse = (index: number) => {
    setCursor(index); const sample = samples[index];
    onBrowse(isKnown(sample) ? sample.coordinate : null);
  };
  const moveEndpoint = (endpoint: "startMeters" | "endMeters", distance: number) => {
    const candidate = samples[findPosition(samples, distance)].distanceMeters;
    const current = draftRef.current ?? selection;
    if (candidate < range.startMeters || candidate > range.endMeters || (endpoint === "startMeters" ? candidate >= current.endMeters : candidate <= current.startMeters)) return current;
    const next = { ...current, [endpoint]: candidate };
    draftRef.current = next;
    return next;
  };
  const cancelDrag = () => { cancelFrame(); drag.current = null; draftRef.current = null; setDraft(null); };
  const handleSliderKey = (event: KeyboardEvent<SVGGElement>, endpoint: "startMeters" | "endMeters") => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelDrag(); return; }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const currentIndex = findPosition(samples, selection[endpoint]);
    const nextIndex = event.key === "Home" ? findPosition(samples, range.startMeters) : event.key === "End" ? findPosition(samples, range.endMeters) : Math.max(0, Math.min(samples.length - 1, currentIndex + (["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1)));
    const next = moveEndpoint(endpoint, samples[nextIndex].distanceMeters);
    props.onCommitRange(next); draftRef.current = null;
  };
  return <div className="elevation-chart">
    <svg ref={svgRef} viewBox="0 0 320 104" preserveAspectRatio="none" tabIndex={0} role="group" aria-label="距离与估算海拔曲线，方向键浏览，Enter选择所在坡段" onKeyDown={(event) => {
      if (event.key === "Escape" && drag.current) { event.preventDefault(); event.stopPropagation(); cancelDrag(); return; }
      if (event.key === "Enter" && visibleActive && !selecting) { const section = sections.find((item) => item.startMeters <= visibleActive.distanceMeters && item.endMeters >= visibleActive.distanceMeters); if (section) props.onSelectSection(section.id); return; }
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const minIndex = findPosition(samples, range.startMeters); const maxIndex = Math.min(samples.length - 1, findPosition(samples, range.endMeters));
      browse(event.key === "Home" ? minIndex : event.key === "End" ? maxIndex : Math.max(minIndex, Math.min(maxIndex, (cursor ?? minIndex) + (event.key === "ArrowRight" ? 1 : -1))));
    }} onPointerDown={(event) => {
      if (!selecting) return;
      const endpoint = (event.target as Element).closest("[data-endpoint]")?.getAttribute("data-endpoint") as "startMeters" | "endMeters" | null;
      if (!endpoint) return;
      event.preventDefault(); drag.current = { endpoint, original: selection }; draftRef.current = selection;
      (event.target as SVGElement).closest<SVGGElement>("[data-endpoint]")?.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={(event) => {
      const distance = distanceFromPointer(event);
      if (drag.current) { const next = moveEndpoint(drag.current.endpoint, distance); schedule(() => setDraft(next)); }
      else schedule(() => browse(findPosition(samples, distance)));
    }} onPointerUp={(event) => {
      if (!drag.current) return;
      cancelFrame(); if (draftRef.current) props.onCommitRange(draftRef.current);
      cancelDrag(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }} onPointerCancel={cancelDrag} onLostPointerCapture={() => { if (drag.current) cancelDrag(); }} onPointerLeave={() => { if (!drag.current) { cancelFrame(); setCursor(null); onBrowse(null); } }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) { setCursor(null); onBrowse(null); } }} onClick={(event) => {
      if (selecting) return;
      const distance = distanceFromPointer(event);
      const section = sections.find((item) => item.startMeters <= distance && item.endMeters >= distance);
      if (section) props.onSelectSection(section.id);
    }}>
      <defs><pattern id="elevation-unknown-hatch" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6L6 0" className="elevation-chart__hatch" /></pattern>{emphasizedRange ? <clipPath id={selectionClipId}><rect x={chart.x(emphasizedRange.startMeters)} y="10" width={chart.x(emphasizedRange.endMeters) - chart.x(emphasizedRange.startMeters)} height="68" /></clipPath> : null}</defs>
      <path d="M44 14H304M44 74H304" className="elevation-chart__grid" />
      <text x="0" y="18">{chart.max}m</text><text x="0" y="78">{chart.min}m</text>
      {chart.unknown.map((unknown, index) => <rect key={index} x={chart.x(unknown.startMeters)} y="14" width={Math.max(2, chart.x(unknown.endMeters) - chart.x(unknown.startMeters))} height="60" fill="url(#elevation-unknown-hatch)"><title>高程未知或低可信度，统计在此断开</title></rect>)}
      {sections.map((section) => <rect key={section.id} x={chart.x(section.startMeters)} y="14" width={chart.x(section.endMeters) - chart.x(section.startMeters)} height="60" className={selected?.id === section.id ? "elevation-chart__selected" : "elevation-chart__section"}><title>{section.direction === "ascent" ? "上坡" : "下坡"} 第{kilometers(section.startMeters)}–{kilometers(section.endMeters)}公里</title></rect>)}
      {selecting ? <rect x={chart.x(displaySelection.startMeters)} y="14" width={chart.x(displaySelection.endMeters) - chart.x(displaySelection.startMeters)} height="60" className="elevation-chart__selected" /> : null}
      {chart.paths.map((path, index) => <path key={index} d={path} className="elevation-chart__line" />)}
      {emphasizedRange ? <g clipPath={`url(#${selectionClipId})`} aria-hidden="true">{chart.paths.map((path, index) => <path key={index} d={path} className="elevation-chart__line elevation-chart__line--selected" />)}</g> : null}
      {controlPoints.filter((point) => point.distanceMeters >= range.startMeters && point.distanceMeters <= range.endMeters).map((point) => <circle key={point.id} cx={chart.x(point.distanceMeters)} cy="78" r="2.5" className="elevation-chart__point"><title>{controlPoints.indexOf(point) + 1}. {point.name} · 第{kilometers(point.distanceMeters)}公里</title></circle>)}
      <text x="44" y="100">{kilometers(range.startMeters)}</text><text x="174" y="100" textAnchor="middle">{kilometers((range.startMeters + range.endMeters) / 2)}</text><text x="304" y="100" textAnchor="end">{kilometers(range.endMeters)}km</text>
      {visibleActive ? <line x1={chart.x(visibleActive.distanceMeters)} x2={chart.x(visibleActive.distanceMeters)} y1="14" y2="74" className="elevation-chart__cursor" /> : null}
      {selecting ? (["startMeters", "endMeters"] as const).map((endpoint) => <ElevationChartRangeHandle key={endpoint} endpoint={endpoint} x={chart.x(displaySelection[endpoint])} range={range} value={displaySelection[endpoint]} onKey={handleSliderKey} />) : null}
    </svg>
    <div className="elevation-chart__readout" aria-live="polite" aria-atomic="true">{visibleActive ? `第${kilometers(visibleActive.distanceMeters)}公里 · ${elevation(visibleActive.elevationMeters)} · 路段${visibleActive.passageIndex + 1} · ${isKnown(visibleActive) ? "地表估算" : "高程未知/低可信度"}` : selecting ? `选区 ${kilometers(displaySelection.startMeters)}–${kilometers(displaySelection.endMeters)}km · 松手应用` : "悬停或方向键浏览 · 点击坡段固定详情"}</div>
  </div>;
}
