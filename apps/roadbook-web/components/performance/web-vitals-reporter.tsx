"use client";

import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";

/** 仅本地性能验证，不上传用户位置、路线、资源 URL 或遥测数据。 */
function reportMetric({ name, value, rating }: { name: string; value: number; rating: string }) {
  if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
  console.debug("[Roadbook performance]", JSON.stringify({ name, value, rating }));
}

export function WebVitalsReporter() {
  useReportWebVitals(reportMetric);
  useEffect(() => {
    if (!["localhost", "127.0.0.1"].includes(window.location.hostname)
      || !PerformanceObserver.supportedEntryTypes.includes("layout-shift")) return;
    let sessionStart = 0;
    let previous = 0;
    let sessionValue = 0;
    let maximum = 0;
    // 本地持续记录 session-window 最大值，便于无需离开页面的布局验收。
    const report = (regions: string[] = []) => console.debug("[Roadbook performance]", JSON.stringify({ name: "CLS-observed", value: maximum, regions }));
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number; sources?: { node?: Node }[] };
        if (shift.hadRecentInput) continue;
        if (shift.startTime - previous > 1000 || shift.startTime - sessionStart > 5000) {
          sessionStart = shift.startTime;
          sessionValue = 0;
        }
        previous = shift.startTime;
        sessionValue += shift.value;
        if (sessionValue > maximum) {
          maximum = sessionValue;
          // 仅记录固定区域分类，不记录 DOM 文本、属性、坐标或资源地址。
          const regions = [...new Set((shift.sources ?? []).map(({ node }) => {
            const element = node instanceof Element ? node : node?.parentElement;
            return element?.closest(".route-map__canvas") ? "map-canvas"
              : element?.closest(".workspace-task-sheet") ? "task-sheet" : "page";
          }))];
          report(regions);
        }
      }
    });
    observer.observe({ type: "layout-shift", buffered: true });
    report();
    return () => observer.disconnect();
  }, []);
  return null;
}
