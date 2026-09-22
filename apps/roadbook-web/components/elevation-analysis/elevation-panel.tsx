"use client";

import { useState } from "react";

import { ChevronDownIcon, MountainIcon } from "@/components/ui/icons";

export function ElevationPanel({ hasRoute }: { hasRoute: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`elevation-panel widget ${open ? "is-open" : ""}`} aria-label="海拔分析">
      <button type="button" className="elevation-panel__trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="elevation-panel__icon"><MountainIcon /></span>
        <span><small>地形分析</small><strong>基础海拔</strong></span>
        <span className="elevation-panel__status">{hasRoute ? "数据源待接入" : "路线生成后可用"}</span>
        <ChevronDownIcon className={open ? "is-rotated" : ""} />
      </button>
      <div className="elevation-panel__content">
        <div className="elevation-empty">
          <svg aria-hidden="true" viewBox="0 0 620 100" preserveAspectRatio="none"><path d="M0 80C55 78 72 42 125 51s70 25 112 15 55-50 104-47 58 57 108 50 81-42 120-31 31 40 51 34"/><path className="baseline" d="M0 86h620"/></svg>
          <div><strong>当前地图服务暂未接入高程数据</strong><span>路线规划和指标可继续使用；接入经授权的高程来源后，这里将展示估算海拔曲线。</span></div>
        </div>
      </div>
    </section>
  );
}
