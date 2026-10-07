"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouteElevationAnalysis } from "@/hooks/use-route-elevation-analysis";
import { sliceElevationPaths } from "@/domain/elevation-analysis/geometry";
import { ELEVATION_SOURCE, type ElevationProvider } from "@/domain/elevation-analysis/model";
import type { ElevationPanelProps } from "./elevation-panel";
import { ElevationRangeSelector } from "./elevation-range-selector";
import { ElevationRangeSummary } from "./elevation-range-summary";
import { SlopeSectionDetails } from "./slope-section-details";
import { RouteElevationChart } from "./route-elevation-chart";
import { kilometers } from "./elevation-format";

export function ElevationAnalysisView(props: ElevationPanelProps & { enabled: boolean; onPreview: (text: string) => void; elevationProvider?: ElevationProvider }) {
  const analysis = useRouteElevationAnalysis(props, props.enabled, props.selectedLegId, props.elevationProvider);
  const { geometry, profile, summary, sections, selectedSection, key } = analysis;
  const [pageChoice, setPageChoice] = useState<{ key: string; page: "chart" | "range" | "directory" | "data" } | null>(null);
  const [selectingKey, setSelectingKey] = useState<string | null>(null);
  const page = pageChoice?.key === key ? pageChoice.page : "chart";
  const selecting = selectingKey === key;
  const rangeTrigger = useRef<HTMLButtonElement>(null);
  const directoryTrigger = useRef<HTMLButtonElement>(null);
  const dataTrigger = useRef<HTMLButtonElement>(null);
  const selectedIndex = selectedSection ? sections.findIndex((section) => section.id === selectedSection.id) : -1;
  const paths = useMemo(() => geometry && selectedSection ? sliceElevationPaths(geometry, selectedSection.startMeters, selectedSection.endMeters) : [], [geometry, selectedSection]);
  const { onHighlight, onBrowse, onFocus, onPreview } = props;
  useEffect(() => {
    onHighlight(props.enabled ? paths : []);
    return () => { onHighlight([]); onBrowse(null); };
  }, [props.enabled, paths, onHighlight, onBrowse]);
  const preview = useMemo(() => {
    if (!profile || !summary) return null;
    if (!sections.length) return summary.coverage < 0.999 ? "高程不足，暂无法判断长坡" : "未识别到重点长坡";
    const up = sections.filter((section) => section.direction === "ascent").reduce((value, section) => Math.max(value, section.lengthMeters), 0);
    const down = sections.filter((section) => section.direction === "descent").reduce((value, section) => Math.max(value, section.lengthMeters), 0);
    return `${summary.coverage < 0.999 ? "已覆盖区间 · " : ""}${up ? `↑ 最长上坡${kilometers(up)}km` : "未识别长上坡"} · ${down ? `↓ 最长下坡${kilometers(down)}km` : "未识别长下坡"}`;
  }, [profile, summary, sections]);
  useEffect(() => { if (preview) onPreview(preview); }, [preview, onPreview]);
  const showPage = (page: "chart" | "range" | "directory" | "data") => { onBrowse(null); setPageChoice({ key, page }); };
  const returnFromPage = () => {
    showPage("chart");
    const trigger = page === "range" ? rangeTrigger : page === "directory" ? directoryTrigger : dataTrigger;
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  };
  if (!props.route || !geometry) return <div className="elevation-placeholder" role="status">{props.updating ? "路线更新后可用" : analysis.error ?? "路线生成后可用"}</div>;
  if (!profile) return <div className="elevation-placeholder" role="status" aria-live="polite">
    {analysis.state?.status === "failed" ? <><strong>暂时无法分析沿线起伏</strong><p>{analysis.state.message}</p><button type="button" onClick={analysis.retry}>重试高程查询</button></> : <><strong>正在分析沿线起伏</strong><p>{analysis.state?.completed ?? 0} / {Math.ceil(geometry.samples.length / 100)} 批</p><p>公共试验服务 · 长路线可能需要数十秒</p><progress max={Math.ceil(geometry.samples.length / 100)} value={analysis.state?.completed ?? 0} aria-label="已完成高程查询批次" /></>}
  </div>;
  const setFullRange = () => { analysis.setRange({ startMeters: 0, endMeters: geometry.distanceMeters }); setSelectingKey(null); };
  return <div className="elevation-analysis" onKeyDown={(event) => {
    if (event.key !== "Escape") return;
    if (page !== "chart") returnFromPage();
    else if (selecting) { setSelectingKey(null); rangeTrigger.current?.focus({ preventScroll: true }); }
    else if (analysis.isLocalView) analysis.returnToRange();
    else return;
    event.preventDefault(); event.stopPropagation();
  }}>
    {page === "range" ? <ElevationRangeSelector key={`${key}:${props.selectedLegId}`} geometry={geometry} range={analysis.range} onCommit={analysis.setRange} onClose={returnFromPage} onSelectOnChart={() => { showPage("chart"); setSelectingKey(key); }} /> : page === "directory" ? <div className="elevation-directory"><div className="elevation-page-heading"><strong>重点坡段 · 行驶顺序</strong><button type="button" autoFocus onClick={returnFromPage}>返回曲线</button></div><ol>{sections.map((section, index) => <li key={section.id}><button type="button" aria-current={selectedSection?.id === section.id ? "true" : undefined} onClick={() => { analysis.selectSection(section.id); returnFromPage(); }}><strong>{index + 1}. {section.direction === "ascent" ? "↑ 上坡" : "↓ 下坡"} · {kilometers(section.lengthMeters)}km</strong><span>第{kilometers(section.startMeters)}–{kilometers(section.endMeters)}公里</span></button></li>)}</ol></div> : page === "data" ? <div className="elevation-source"><div className="elevation-page-heading"><strong>数据与估算说明</strong><button type="button" autoFocus onClick={returnFromPage}>返回曲线</button></div>
      <p>来源：<a href="https://www.opentopodata.org/" target="_blank" rel="noreferrer">{ELEVATION_SOURCE.name}</a>，约30m水平分辨率，单位米，EGM96垂直基准。数据约采集于2000年，不代表当前工程路面。</p>
      <p>地图GCJ-02经近似逆解转换为WGS84查询。桥梁、隧道和高架可能与地表高程不同；当前算路响应无可靠结构标记，不能声称这些路段已识别。</p>
      <p>横轴为道路折线测距 {kilometers(geometry.distanceMeters)}km；供应商里程 {kilometers(geometry.providerDistanceMeters)}km；差异 {kilometers(Math.abs(geometry.distanceMeters - geometry.providerDistanceMeters))}km。横轴未按供应商里程缩放。</p>
      <p>100m采样，500m局部窗口与2km趋势窗口；算法 {profile.algorithmVersion}，参数尚未通过真实道路定版。缺失区间不补零、不跨缺口统计。</p>
      <p>只向第三方发送必要采样坐标；不发送方案名或用户身份。原始高程与分析结果分别在内存缓存；响应禁止公共缓存，不增加云端路线仓储。</p>
      <p>公共服务每批100点、每秒1次、每天1000次。当前为单进程试验接入，多实例部署前须配置共享限流并复核服务条款。</p>
    </div> : <>
      <div className="elevation-range-bar"><button ref={rangeTrigger} type="button" onClick={() => showPage("range")}>范围 {kilometers(analysis.viewRange.startMeters)}–{kilometers(analysis.viewRange.endMeters)}km ▾</button><button type="button" onClick={analysis.isLocalView ? analysis.returnToRange : setFullRange}>{analysis.isLocalView ? "返回当前区间" : "全程"}</button></div>
      {selecting ? <div className="elevation-selection-help"><span>拖动手柄或方向键逐采样调整</span><button type="button" onClick={() => setSelectingKey(null)}>完成选区</button></div> : null}
      <RouteElevationChart key={`${key}:${selecting}:${props.selectedLegId}`} samples={profile.samples} controlPoints={geometry.controlPoints} range={selecting ? { startMeters: 0, endMeters: geometry.distanceMeters } : analysis.viewRange} selection={analysis.range} selecting={selecting} sections={sections} selected={selectedSection} onCommitRange={analysis.setRange} onSelectSection={analysis.selectSection} onBrowse={onBrowse} />
      {summary ? <ElevationRangeSummary summary={summary} /> : null}
      {analysis.state?.message ? <div className="elevation-warning" role="status">部分高程不可用 · {analysis.state.message}<button type="button" onClick={analysis.retry}>重试缺失查询</button></div> : null}
      {sections.length ? <SlopeSectionDetails section={selectedSection} index={selectedIndex} total={sections.length} onPrevious={() => analysis.selectSection(sections[selectedIndex - 1]?.id ?? null)} onNext={() => analysis.selectSection(sections[selectedIndex + 1]?.id ?? null)} onDirectory={() => showPage("directory")} onView={() => { onFocus(paths); analysis.viewSection(); }} /> : <p className="elevation-no-slopes">{preview}。{summary && summary.coverage >= 0.999 ? "轻微起伏仍保留在曲线上。" : "未知区间不参与长坡判断。"}</p>}
      {sections.length ? <button ref={directoryTrigger} className="elevation-directory-entry" type="button" onClick={() => showPage("directory")}>坡段目录 · {sections.length}段</button> : null}
      <div className="elevation-source-entry"><span>估算高程 · 试验</span><button ref={dataTrigger} type="button" onClick={() => showPage("data")}>数据说明</button></div>
    </>}
  </div>;
}
