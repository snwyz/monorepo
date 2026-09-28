"use client";

import type { RoutePlanStrategy } from "@/domain/route-planning/model";

import { AlertIcon, CheckIcon, UndoIcon } from "@/components/ui/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { DraftStatus, RouteCalculationStatus } from "@/domain/route-planning/model";

interface RouteStrategySelectorProps {
  compact?: boolean;
  strategy: RoutePlanStrategy;
  routeStatus: RouteCalculationStatus;
  draftStatus: DraftStatus;
  error: string | null;
  canUndo: boolean;
  onStrategyChange: (strategy: RoutePlanStrategy) => void;
  onUndo: () => void;
}

const labels: Record<RoutePlanStrategy, string> = {
  highway: "高速优先",
  "avoid-highway": "不走高速",
};

export function RouteStrategySelector({ compact = false, strategy, routeStatus, draftStatus, error, canUndo, onStrategyChange, onUndo }: RouteStrategySelectorProps) {
  const feedback = routeStatus === "updating"
    ? { label: "路线更新中", className: "is-loading" }
    : routeStatus === "failed"
      ? { label: error ?? "路线计算失败", className: "is-error" }
      : draftStatus === "saving"
        ? { label: "暂存中", className: "is-loading" }
        : draftStatus === "failed"
          ? { label: "暂存失败", className: "is-error" }
          : { label: "已暂存至本机", className: "is-success" };

  const strategyControl = (
    <Select value={strategy} onValueChange={(value) => onStrategyChange(value as RoutePlanStrategy)}>
      <SelectTrigger className="strategy-selector__select-trigger" aria-label="选择全程路线策略">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="strategy-selector__select-content" align="start">
        {Object.entries(labels).map(([value, label]) => (
          <SelectItem value={value} key={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (compact) return (
    <>
      {strategyControl}
      {feedback.className === "is-error" ? (
        <span className="address-list__strategy-error" role="status">{feedback.label}</span>
      ) : null}
    </>
  );

  return (
    <section data-glass="desktop" className="strategy-selector widget workspace-mobile-only" aria-label="路线策略与状态">
      <label>
        <span>全程策略</span>
        {strategyControl}
      </label>
      <span className="strategy-selector__divider" />
      <span className={`route-feedback ${feedback.className}`} title={feedback.label}>
        {feedback.className === "is-error" ? <AlertIcon /> : feedback.className === "is-success" ? <CheckIcon /> : <Spinner />}
        <span>{feedback.label}</span>
      </span>
      <button type="button" disabled={!canUndo} onClick={onUndo} className="undo-button" title="撤销最近一次编辑"><UndoIcon />撤销</button>
    </section>
  );
}
