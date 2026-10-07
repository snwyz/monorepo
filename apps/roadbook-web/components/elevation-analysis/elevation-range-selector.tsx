"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ElevationGeometry, RouteElevationRange } from "@/domain/elevation-analysis/model";
import { kilometers } from "./elevation-format";

export function ElevationRangeSelector({ geometry, range, onCommit, onSelectOnChart, onClose }: {
  geometry: ElevationGeometry; range: RouteElevationRange;
  onCommit: (range: RouteElevationRange) => boolean;
  onSelectOnChart: () => void; onClose: () => void;
}) {
  const [startIndex, setStartIndex] = useState("0");
  const [endIndex, setEndIndex] = useState(String(geometry.controlPoints.length - 1));
  const [startKm, setStartKm] = useState(String(range.startMeters / 1000));
  const [endKm, setEndKm] = useState(String(range.endMeters / 1000));
  const [error, setError] = useState("");
  return <div className="elevation-range-editor">
    <div className="elevation-page-heading"><strong>选择分析范围</strong><button type="button" autoFocus onClick={onClose}>返回曲线</button></div>
    <button type="button" onClick={() => { onCommit({ startMeters: 0, endMeters: geometry.distanceMeters }); onClose(); }}>全程 · {kilometers(geometry.distanceMeters)}km</button>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (onCommit({ startMeters: geometry.controlPoints[Number(startIndex)].distanceMeters, endMeters: geometry.controlPoints[Number(endIndex)].distanceMeters })) onClose();
      else setError("终点须位于起点之后，且区间长度大于零");
    }}>
      <strong>控制点区间</strong>
      <div className="elevation-range-editor__fields">
        <Select value={startIndex} onValueChange={setStartIndex}><SelectTrigger aria-label="区间起点"><SelectValue /></SelectTrigger><SelectContent>{geometry.controlPoints.map((point, index) => <SelectItem key={point.id} value={String(index)} disabled={index >= Number(endIndex)}>{index + 1}. {point.name}</SelectItem>)}</SelectContent></Select>
        <Select value={endIndex} onValueChange={setEndIndex}><SelectTrigger aria-label="区间终点"><SelectValue /></SelectTrigger><SelectContent>{geometry.controlPoints.map((point, index) => <SelectItem key={point.id} value={String(index)} disabled={index <= Number(startIndex)}>{index + 1}. {point.name}</SelectItem>)}</SelectContent></Select>
      </div>
      <button type="submit">应用控制点区间</button>
    </form>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (startKm.trim() && endKm.trim() && onCommit({ startMeters: Number(startKm) * 1000, endMeters: Number(endKm) * 1000 })) onClose();
      else setError(`请输入0至${kilometers(geometry.distanceMeters)}km内的有效起终点，终点须在起点之后`);
    }}>
      <strong>全程累计里程区间</strong>
      <div className="elevation-range-editor__fields"><label>起点（km）<input type="number" step="any" min="0" max={geometry.distanceMeters / 1000} value={startKm} onChange={(event) => setStartKm(event.target.value)} /></label><label>终点（km）<input type="number" step="any" min="0" max={geometry.distanceMeters / 1000} value={endKm} onChange={(event) => setEndKm(event.target.value)} /></label></div>
      <button type="submit">应用里程区间</button>
    </form>
    <button type="button" onClick={onSelectOnChart}>曲线选区间 · 双端手柄</button>
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
