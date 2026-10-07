"use client";

import { lazy, Suspense, type CSSProperties, useId, useState } from "react";

import { RoadbookMark } from "@/components/branding/roadbook-mark";
import { Button } from "@/components/ui/button";
import { CheckIcon, ChevronDownIcon, EditIcon, MoreIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { useMobileSwipeRemoval } from "@/components/ui/use-mobile-swipe-removal";
import {
  formatPlanDisplayName,
  formatPlanUpdatedDateHeading,
  formatPlanUpdatedTime,
  getPlanUpdatedDateKey,
  type RoutePlan,
  type RoutePlanSummary,
} from "@/domain/route-planning/model";

const RoutePlanDeleteConfirmation = lazy(() =>
  import("@/components/route-plan-catalog/route-plan-delete-confirmation").then(
    (module) => ({ default: module.RoutePlanDeleteConfirmation }),
  ),
);

const RoutePlanClearConfirmation = lazy(() =>
  import("@/components/route-plan-catalog/route-plan-clear-confirmation").then(
    (module) => ({ default: module.RoutePlanClearConfirmation }),
  ),
);

interface RoutePlanSelectorProps {
  catalog: RoutePlanSummary[];
  catalogReady: boolean;
  activePlan: RoutePlan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeLabel?: string;
  contextLabel?: string;
  onCreate: () => void;
  onLoad: (id: string) => boolean;
  onRename: (name: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

interface RoutePlanRowProps {
  plan: RoutePlanSummary;
  isActive: boolean;
  onLoad: (id: string) => boolean;
  onLoaded: () => void;
  onRequestDelete: (id: string, label: string) => void;
}

interface RoutePlanDateGroup {
  key: string;
  label: string;
  plans: RoutePlanSummary[];
}

function groupPlansByUpdatedDate(plans: RoutePlanSummary[]): RoutePlanDateGroup[] {
  return plans.reduce<RoutePlanDateGroup[]>((groups, plan) => {
    const key = getPlanUpdatedDateKey(plan.updatedAt);
    const existingGroup = groups.find((group) => group.key === key);
    if (existingGroup) {
      existingGroup.plans.push(plan);
      return groups;
    }
    groups.push({
      key,
      label: formatPlanUpdatedDateHeading(plan.updatedAt),
      plans: [plan],
    });
    return groups;
  }, []);
}

function RoutePlanRow({ plan, isActive, onLoad, onLoaded, onRequestDelete }: RoutePlanRowProps) {
  const planLabel = formatPlanDisplayName(plan);
  const planTime = formatPlanUpdatedTime(plan.updatedAt);
  const {
    swipeOffset,
    swipeActionClipPath,
    isSwipeDeleteReady,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleLostPointerCapture,
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
    <div className={`plan-row-shell${isActive ? " is-active" : ""}`}>
      <div
        style={{ clipPath: swipeActionClipPath }}
        className={`plan-row__swipe-action${isSwipeDeleteReady ? " is-ready" : ""}`}
        aria-hidden="true"
      >
        <TrashIcon />
        <span>{isSwipeDeleteReady ? "松开删除" : "左滑删除"}</span>
      </div>
      <button
        data-glass="inset" className={`plan-row ${isActive ? "is-active" : ""}${swipeOffset < 0 ? " is-swiping" : ""}`}
        style={{ "--plan-swipe-offset": `${swipeOffset}px` } as CSSProperties}
        type="button"
        disabled={!plan.loadable}
        onClick={handleLoad}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handleLostPointerCapture}
        aria-current={isActive ? "true" : undefined}
        aria-label={`加载路线${planLabel}，${planTime}，${plan.controlPointCount} 个途经点`}
      >
        <span className="plan-row__route"><RoadbookMark /></span>
        <span className="plan-row__copy">
          <strong>{planLabel}</strong>
          <small>
            <time dateTime={plan.updatedAt}>{planTime}</time>
            <span aria-hidden="true">·</span>
            <span>{plan.controlPointCount} 个途经点</span>
          </small>
        </span>
        <span className="plan-row__trailing">
          {isActive ? (
            <span className="plan-row__selected-mark" aria-hidden="true">
              <CheckIcon />
            </span>
          ) : null}
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
        </span>
      </button>
    </div>
  );
}

export function RoutePlanSelector({
  catalog,
  catalogReady,
  activePlan,
  open,
  onOpenChange,
  resumeLabel,
  contextLabel,
  onCreate,
  onLoad,
  onRename,
  onDelete,
  onClearAll,
}: RoutePlanSelectorProps) {
  const catalogId = useId();
  const [deleteConfirmationLoaded, setDeleteConfirmationLoaded] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<{ id: string; label: string } | null>(null);
  const [clearConfirmationLoaded, setClearConfirmationLoaded] = useState(false);
  const [clearRequested, setClearRequested] = useState(false);
  const [managementMenuOpen, setManagementMenuOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState<{ planId: string; value: string } | null>(null);
  const activePlanSummary = activePlan
    ? catalog.find((plan) => plan.id === activePlan.id)
    : undefined;
  const activePlanLabel = activePlan
    ? formatPlanDisplayName(activePlanSummary ?? activePlan)
    : "选择路线";
  const canToggleCatalog = !open || Boolean(resumeLabel);
  const isRenamingActivePlan = Boolean(
    activePlan && renameDraft?.planId === activePlan.id,
  );
  const planGroups = groupPlansByUpdatedDate(catalog);

  const closeSelector = () => {
    onOpenChange(false);
    setManagementMenuOpen(false);
    setRenameDraft(null);
  };

  const toggleSelector = () => {
    if (open) {
      closeSelector();
      return;
    }
    onOpenChange(true);
  };

  const requestDelete = (id: string, label: string) => {
    setDeleteConfirmationLoaded(true);
    setDeleteCandidate({ id, label });
  };

  const confirmDelete = () => {
    if (!deleteCandidate) return;
    onDelete(deleteCandidate.id);
    setDeleteCandidate(null);
  };

  const requestClearAll = () => {
    setManagementMenuOpen(false);
    setClearConfirmationLoaded(true);
    setClearRequested(true);
  };

  const requestRename = () => {
    if (!activePlan) return;
    setManagementMenuOpen(false);
    setRenameDraft({ planId: activePlan.id, value: activePlanLabel });
  };

  const commitRename = () => {
    if (!activePlan || renameDraft?.planId !== activePlan.id) return;
    const nextName = renameDraft.value.trim();
    setRenameDraft(null);
    if (nextName !== activePlanLabel) onRename(nextName);
  };

  const confirmClearAll = () => {
    onClearAll();
    setClearRequested(false);
    setManagementMenuOpen(false);
    setRenameDraft(null);
    onOpenChange(true);
  };

  return (
    <section className="plan-selector" data-catalog-open={open} aria-label="路线方案">
      <div data-glass="desktop" className="plan-selector__header">
        {canToggleCatalog ? (
          <button
            className="plan-selector__trigger"
            type="button"
            onClick={toggleSelector}
            aria-expanded={open}
            aria-controls={catalogId}
            aria-label={`${open ? "返回当前任务" : "查看我的路线"}，${contextLabel ?? activePlanLabel}`}
          >
            <span className="plan-selector__brand"><RoadbookMark /></span>
            <span className="plan-selector__copy">
              <small className="plan-selector__eyebrow">
                <span>我的路线</span>
                {catalog.length > 0 ? <span className="plan-selector__count">{catalog.length}</span> : null}
              </small>
              <span className="plan-selector__title">
                <strong title={contextLabel ?? activePlanLabel}>{contextLabel ?? activePlanLabel}</strong>
                <ChevronDownIcon className={open ? "is-rotated" : ""} />
              </span>
            </span>
          </button>
        ) : (
          <div className="plan-selector__heading">
            <span className="plan-selector__brand"><RoadbookMark /></span>
            <span className="plan-selector__copy">
              <span className="plan-selector__title">
                <strong>我的路线</strong>
                {catalog.length > 0 ? <span className="plan-selector__count">{catalog.length}</span> : null}
              </span>
            </span>
          </div>
        )}
        <Button type="button" variant="secondary" className="plan-selector__create" onClick={() => { onCreate(); closeSelector(); }}>
          <PlusIcon />新建规划
        </Button>
      </div>
      {(
        <div id={catalogId} data-glass="desktop" className={`plan-selector__menu${open ? " is-open" : ""}`}>
          {resumeLabel ? <button type="button" className="plan-selector__resume" onClick={closeSelector}><ChevronDownIcon />{resumeLabel}</button> : null}
          <div className="plan-selector__menu-head">
            <span className="plan-selector__menu-title">
              <span>已存路线</span>
              <span className="plan-selector__count">{catalog.length}</span>
            </span>
            {catalog.length > 0 ? (
              <span
                className="plan-selector__management"
                onBlur={(event) => {
                  const nextTarget = event.relatedTarget;
                  if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                    setManagementMenuOpen(false);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setManagementMenuOpen(false);
                }}
              >
                <button
                  className="plan-selector__management-trigger"
                  type="button"
                  aria-label="管理已存路线"
                  aria-haspopup="menu"
                  aria-expanded={managementMenuOpen}
                  onClick={() => setManagementMenuOpen((value) => !value)}
                >
                  <MoreIcon />
                </button>
                {managementMenuOpen ? (
                  <span data-glass="overlay" className="plan-selector__management-menu" role="menu">
                    {activePlan ? (
                      <button type="button" role="menuitem" onClick={requestRename}>
                        <EditIcon />
                        重命名当前路线
                      </button>
                    ) : null}
                    <button type="button" role="menuitem" onClick={requestClearAll}>
                      <TrashIcon />
                      清除全部路线
                    </button>
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
          {isRenamingActivePlan ? (
            <form
              data-glass="inset" className="plan-selector__rename-panel"
              onSubmit={(event) => {
                event.preventDefault();
                commitRename();
              }}
            >
              <label htmlFor="route-plan-name-editor">路线名称</label>
              <input
                id="route-plan-name-editor"
                aria-describedby="route-plan-name-hint"
                autoFocus
                value={renameDraft?.value ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setRenameDraft((current) => current
                    ? { ...current, value }
                    : current);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setRenameDraft(null);
                }}
              />
              <div className="plan-selector__rename-footer">
                <small id="route-plan-name-hint">留空将使用地点自动命名</small>
                <span>
                  <button type="button" onClick={() => setRenameDraft(null)}>取消</button>
                  <button type="submit">完成</button>
                </span>
              </div>
            </form>
          ) : null}
          <div className="plan-selector__list">
            {!catalogReady ? <p className="empty-list" role="status">正在读取本机路线…</p> : catalog.length === 0 ? <p className="empty-list">还没有路线方案，点击上方新建规划开始。</p> : null}
            {planGroups.map((group) => (
              <section className="plan-date-group" key={group.key} aria-label={group.label}>
                <h3>{group.label}</h3>
                {group.plans.map((plan) => (
                  <RoutePlanRow
                    key={plan.id}
                    plan={plan}
                    isActive={activePlan?.id === plan.id}
                    onLoad={onLoad}
                    onLoaded={closeSelector}
                    onRequestDelete={requestDelete}
                  />
                ))}
              </section>
            ))}
          </div>
        </div>
      )}
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
      {clearConfirmationLoaded ? (
        <Suspense fallback={null}>
          <RoutePlanClearConfirmation
            open={clearRequested}
            routeCount={catalog.length}
            onOpenChange={setClearRequested}
            onConfirm={confirmClearAll}
          />
        </Suspense>
      ) : null}
    </section>
  );
}
