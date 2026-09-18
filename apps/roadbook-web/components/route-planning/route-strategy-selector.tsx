"use client";

import type { DrivingStrategy } from "@roadbook/map/web";

import { AlertIcon, CheckIcon, UndoIcon } from "@/components/ui/icons";
import type { DraftStatus, RouteCalculationStatus } from "@/domain/route-planning/model";

interface RouteStrategySelectorProps {
  strategy: DrivingStrategy;
  routeStatus: RouteCalculationStatus;
  draftStatus: DraftStatus;
  error: string | null;
  canUndo: boolean;
  onStrategyChange: (strategy: DrivingStrategy) => void;
  onUndo: () => void;
}

const labels: Record<DrivingStrategy, string> = {
  recommend: "推荐路线",
  highway: "高速优先",
  "avoid-highway": "非高速／国道参考",
};

export function RouteStrategySelector({ strategy, routeStatus, draftStatus, error, canUndo, onStrategyChange, onUndo }: RouteStrategySelectorProps) {
  const feedback = routeStatus === "updating"
    ? { label: "路线更新中", className: "is-loading" }
    : routeStatus === "failed"
      ? { label: error ?? "路线计算失败", className: "is-error" }
      : draftStatus === "saving"
        ? { label: "暂存中", className: "is-loading" }
        : draftStatus === "failed"
          ? { label: "暂存失败", className: "is-error" }
          : { label: "已暂存至本机", className: "is-success" };

  return (
    <section className="strategy-selector widget" aria-label="路线策略与状态">
      <label>
        <span>全程策略</span>
        <select value={strategy} onChange={(event) => onStrategyChange(event.target.value as DrivingStrategy)}>
          {Object.entries(labels).map(([value, label]) => (
            <option value={value} key={value} disabled={value === "highway"}>
              {value === "highway" ? `${label}（当前服务不支持）` : label}
            </option>
          ))}
        </select>
      </label>
      <span className="strategy-selector__divider" />
      <span className={`route-feedback ${feedback.className}`} title={feedback.label}>
        {feedback.className === "is-error" ? <AlertIcon /> : feedback.className === "is-success" ? <CheckIcon /> : <span className="spinner" />}
        <span>{feedback.label}</span>
      </span>
      <button type="button" disabled={!canUndo} onClick={onUndo} className="undo-button" title="撤销最近一次编辑"><UndoIcon />撤销</button>
    </section>
  );
}
