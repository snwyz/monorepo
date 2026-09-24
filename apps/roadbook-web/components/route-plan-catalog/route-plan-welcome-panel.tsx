"use client";

import { Button } from "@/components/ui/button";
import { RoadbookMark } from "@/components/branding/roadbook-mark";
import { PlusIcon } from "@/components/ui/icons";

interface RoutePlanWelcomePanelProps {
  onCreate: () => void;
}

export function RoutePlanWelcomePanel({ onCreate }: RoutePlanWelcomePanelProps) {
  return (
    <aside className="route-plan-welcome widget" aria-labelledby="route-plan-welcome-title">
      <header>
        <span className="route-plan-welcome__icon"><RoadbookMark /></span>
        <span>
          <small>从地图开始</small>
          <h1 id="route-plan-welcome-title">规划自驾环线</h1>
        </span>
      </header>
      <p>搜索地点，或双击地图添加第一个控制点。</p>
      <Button size="lg" onClick={onCreate}><PlusIcon />新建规划</Button>
      <footer>仅保存在当前浏览器，不会公开分享</footer>
    </aside>
  );
}
