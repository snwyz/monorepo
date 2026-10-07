"use client";

import { useEffect } from "react";
import { useRouteElevationAnalysis } from "@/hooks/use-route-elevation-analysis";
import type { ElevationProvider } from "@/domain/elevation-analysis/model";
import type { ElevationPanelProps } from "./elevation-panel";
import { RouteElevationChart } from "./route-elevation-chart";
import { ElevationAnalysisStatus } from "./elevation-analysis-status";

const ignoreBrowse = () => {};

export function ElevationAnalysisView(props: ElevationPanelProps & { enabled: boolean; elevationProvider?: ElevationProvider }) {
  const analysis = useRouteElevationAnalysis(props, props.enabled, props.selectedLegId, props.elevationProvider);
  const { geometry, profile, summary, sections } = analysis;
  const { onHighlight, onBrowse } = props;
  useEffect(() => {
    onHighlight([]);
    return () => { onHighlight([]); onBrowse(null); };
  }, [props.enabled, analysis.key, onHighlight, onBrowse]);
  if (!props.route || !geometry) return <ElevationAnalysisStatus kind="empty" title={props.updating ? "路线更新中" : "沿线海拔待分析"} description={props.updating ? "路线更新后即可查看沿线海拔" : analysis.error ?? "生成路线后查看沿线海拔"} />;
  if (!profile || !summary) return analysis.state?.status === "failed"
    ? <ElevationAnalysisStatus kind="failed" title="海拔暂不可用" description={analysis.state.message ?? "请稍后重新尝试"} onRetry={analysis.retry} />
    : <ElevationAnalysisStatus kind="loading" title="正在分析沿线海拔" completed={analysis.state?.completed} total={analysis.state?.total} />;
  return <div className="elevation-analysis">
    <RouteElevationChart key={`${analysis.key}:${props.selectedLegId}`} samples={profile.samples} range={analysis.viewRange} summary={summary} sections={sections} onBrowse={props.enabled ? onBrowse : ignoreBrowse} />
    <div className="elevation-chart__notice" role="status">数据为实验室数据，仅供参考</div>
  </div>;
}
