"use client";

import { useState, type SyntheticEvent } from "react";

import { Button } from "@/components/ui/button";
import { ChevronDownIcon, PlusIcon, RouteIcon, TrashIcon } from "@/components/ui/icons";
import { formatPlanUpdatedAt, type RoutePlan, type RoutePlanSummary } from "@/domain/route-planning/model";

interface RoutePlanSelectorProps {
  catalog: RoutePlanSummary[];
  activePlan: RoutePlan | null;
  onCreate: () => void;
  onLoad: (id: string) => boolean;
  onRename: (name: string) => void;
  onDelete: (id: string) => void;
}

export function RoutePlanSelector({ catalog, activePlan, onCreate, onLoad, onRename, onDelete }: RoutePlanSelectorProps) {
  const [open, setOpen] = useState(false);

  const remove = (event: SyntheticEvent, id: string, label: string) => {
    event.stopPropagation();
    if (window.confirm(`确认删除“${label}”吗？此操作只删除当前浏览器中的方案。`)) onDelete(id);
  };

  return (
    <section className="plan-selector widget" aria-label="路线方案">
      <button className="plan-selector__trigger" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="plan-selector__brand"><RouteIcon /></span>
        <span className="plan-selector__copy">
          <small>我的路线 · {catalog.length}</small>
          <strong>{activePlan?.name ?? "未选择方案"}</strong>
        </span>
        <ChevronDownIcon className={open ? "is-rotated" : ""} />
      </button>
      {open ? (
        <div className="plan-selector__menu">
          <div className="plan-selector__menu-head">
            <span>已暂存路线</span>
            <span>{catalog.length} 条</span>
          </div>
          <div className="plan-selector__list">
            {catalog.length === 0 ? <p className="empty-list">还没有路线方案</p> : null}
            {catalog.map((plan) => (
              <button
                className={`plan-row ${activePlan?.id === plan.id ? "is-active" : ""}`}
                type="button"
                key={plan.id}
                disabled={!plan.loadable}
                onClick={() => {
                  if (onLoad(plan.id)) setOpen(false);
                }}
              >
                <span className="plan-row__route"><span /><span /><span /></span>
                <span className="plan-row__copy">
                  <strong>{plan.name}</strong>
                  <small>{plan.controlPointCount} 个控制点 · {formatPlanUpdatedAt(plan.updatedAt)}</small>
                </span>
                <span className="plan-row__action" role="button" tabIndex={0} onClick={(event) => remove(event, plan.id, plan.name)} onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") remove(event, plan.id, plan.name);
                }} aria-label={`删除${plan.name}`}><TrashIcon /></span>
              </button>
            ))}
          </div>
          <Button size="lg" className="plan-selector__create" onClick={() => { onCreate(); setOpen(false); }}>
            <PlusIcon />新建规划
          </Button>
        </div>
      ) : null}
      {activePlan ? (
        <input
          className="plan-selector__name"
          aria-label="方案名称"
          key={activePlan.id}
          defaultValue={activePlan.name}
          onBlur={(event) => onRename(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      ) : null}
    </section>
  );
}
