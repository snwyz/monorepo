"use client";

import { lazy, Suspense, type CSSProperties, useState } from "react";

import { Button } from "@/components/ui/button";
import { ChevronDownIcon, PlusIcon, RouteIcon, TrashIcon } from "@/components/ui/icons";
import { useMobileSwipeRemoval } from "@/components/ui/use-mobile-swipe-removal";
import { formatPlanUpdatedAt, type RoutePlan, type RoutePlanSummary } from "@/domain/route-planning/model";

const RoutePlanDeleteConfirmation = lazy(() =>
  import("@/components/route-plan-catalog/route-plan-delete-confirmation").then(
    (module) => ({ default: module.RoutePlanDeleteConfirmation }),
  ),
);

interface RoutePlanSelectorProps {
  catalog: RoutePlanSummary[];
  activePlan: RoutePlan | null;
  onCreate: () => void;
  onLoad: (id: string) => boolean;
  onRename: (name: string) => void;
  onDelete: (id: string) => void;
}

interface RoutePlanRowProps {
  plan: RoutePlanSummary;
  isActive: boolean;
  onLoad: (id: string) => boolean;
  onLoaded: () => void;
  onRequestDelete: (id: string, label: string) => void;
}

function RoutePlanRow({ plan, isActive, onLoad, onLoaded, onRequestDelete }: RoutePlanRowProps) {
  const planLabel = `${formatPlanUpdatedAt(plan.updatedAt)} 规划路线`;
  const {
    swipeOffset,
    isSwipeDeleteReady,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    shouldSuppressClick,
  } = useMobileSwipeRemoval({
    onRequestRemoval: () => onRequestDelete(plan.id, planLabel),
    ignoredTargetSelector: ".plan-row__action",
  });

  const handleLoad = () => {
    if (shouldSuppressClick()) return;
    if (onLoad(plan.id)) onLoaded();
  };

  return (
    <div className="plan-row-shell">
      <div
        className={`plan-row__swipe-action${isSwipeDeleteReady ? " is-ready" : ""}`}
        aria-hidden="true"
      >
        {isSwipeDeleteReady ? "松开删除" : "左滑删除"}
      </div>
      <button
        className={`plan-row ${isActive ? "is-active" : ""}${swipeOffset < 0 ? " is-swiping" : ""}`}
        style={{ "--plan-swipe-offset": `${swipeOffset}px` } as CSSProperties}
        type="button"
        disabled={!plan.loadable}
        onClick={handleLoad}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <span className="plan-row__route"><span /><span /><span /></span>
        <span className="plan-row__copy">
          <strong>{planLabel}</strong>
          <small>{plan.controlPointCount} 个位置信息</small>
        </span>
        <span
          className="plan-row__action"
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onRequestDelete(plan.id, planLabel);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.stopPropagation();
            onRequestDelete(plan.id, planLabel);
          }}
          aria-label={`删除${planLabel}`}
        >
          <TrashIcon />
        </span>
      </button>
    </div>
  );
}

export function RoutePlanSelector({ catalog, activePlan, onCreate, onLoad, onRename, onDelete }: RoutePlanSelectorProps) {
  const [open, setOpen] = useState(false);
  const [deleteConfirmationLoaded, setDeleteConfirmationLoaded] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<{ id: string; label: string } | null>(null);

  const requestDelete = (id: string, label: string) => {
    setDeleteConfirmationLoaded(true);
    setDeleteCandidate({ id, label });
  };

  const confirmDelete = () => {
    if (!deleteCandidate) return;
    onDelete(deleteCandidate.id);
    setDeleteCandidate(null);
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
              <RoutePlanRow
                key={plan.id}
                plan={plan}
                isActive={activePlan?.id === plan.id}
                onLoad={onLoad}
                onLoaded={() => setOpen(false)}
                onRequestDelete={requestDelete}
              />
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
      {deleteConfirmationLoaded ? (
        <Suspense fallback={null}>
          <RoutePlanDeleteConfirmation
            open={Boolean(deleteCandidate)}
            planLabel={deleteCandidate?.label ?? null}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) setDeleteCandidate(null);
            }}
            onConfirm={confirmDelete}
          />
        </Suspense>
      ) : null}
    </section>
  );
}
