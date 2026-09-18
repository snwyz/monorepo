"use client";

import { Button } from "@/components/ui/button";
import { PlusIcon, RouteIcon } from "@/components/ui/icons";
import { formatPlanUpdatedAt, type RoutePlanSummary } from "@/domain/route-planning/model";

interface RoutePlanWelcomePanelProps {
  catalog: RoutePlanSummary[];
  onCreate: () => void;
  onLoad: (id: string) => boolean;
}

export function RoutePlanWelcomePanel({ catalog, onCreate, onLoad }: RoutePlanWelcomePanelProps) {
  return (
    <aside className="route-plan-welcome widget" aria-labelledby="route-plan-welcome-title">
      <header>
        <span className="route-plan-welcome__icon"><RouteIcon /></span>
        <span>
          <small>{catalog.length ? "继续规划" : "从地图开始"}</small>
          <h1 id="route-plan-welcome-title">{catalog.length ? "选择一条路线" : "规划自驾环线"}</h1>
        </span>
      </header>
      <p>{catalog.length
        ? "加载本机方案，或创建一条新路线。"
        : "搜索地点，或双击地图添加第一个控制点。"}</p>
      {catalog.length ? (
        <div className="route-plan-welcome__list">
          {catalog.slice(0, 5).map((plan) => (
            <button type="button" key={plan.id} disabled={!plan.loadable} onClick={() => onLoad(plan.id)}>
              <span className="route-plan-welcome__route"><i /><i /><i /></span>
              <span><strong>{plan.name}</strong><small>{plan.controlPointCount} 个控制点 · {formatPlanUpdatedAt(plan.updatedAt)}</small></span>
            </button>
          ))}
        </div>
      ) : null}
      <Button size="lg" onClick={onCreate}><PlusIcon />新建规划</Button>
      <footer>仅保存在当前浏览器，不会公开分享</footer>
    </aside>
  );
}
