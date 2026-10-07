import { MountainIcon } from "@/components/ui/icons";

interface ElevationAnalysisStatusProps {
  kind: "empty" | "loading" | "failed";
  title: string;
  description?: string;
  completed?: number;
  total?: number;
  onRetry?: () => void;
}

export function ElevationAnalysisStatus({ kind, title, description, completed, total, onRetry }: ElevationAnalysisStatusProps) {
  const progress = total && total > 0 && completed !== undefined ? Math.min(total, Math.max(0, completed)) : undefined;
  const percentage = progress !== undefined && total ? Math.round(progress / total * 100) : null;
  const arranging = percentage === 100 || (completed === 0 && total === 0);
  return <div className={`elevation-placeholder elevation-placeholder--${kind}`} role="status" aria-live="polite" aria-atomic="true">
    <span className="elevation-placeholder__icon" aria-hidden="true"><MountainIcon /></span>
    <div className="elevation-placeholder__copy">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
    {kind === "loading" ? <div className="elevation-placeholder__progress">
      <div className="elevation-placeholder__progress-label"><span>{arranging ? "正在整理海拔曲线" : "正在读取沿线高程"}</span><span>{percentage === null ? arranging ? "" : "准备中" : `${percentage}%`}</span></div>
      <progress max={total && total > 0 ? total : 1} value={progress} aria-label="沿线高程查询进度" />
    </div> : null}
    {onRetry ? <button type="button" className="elevation-placeholder__retry" onClick={onRetry}>重新尝试</button> : null}
  </div>;
}
