import Image from "next/image";
import "./route-charging-entry.css";

interface RouteChargingEntryProps {
  disabled: boolean;
  enabled: boolean;
  status: string;
  error: boolean;
  onToggle: () => void;
  onRetry: () => void;
}

export function RouteChargingEntry({ disabled, enabled, status, error, onToggle, onRetry }: RouteChargingEntryProps) {
  return <section className="route-facilities" aria-label="沿途设施">
    <div className="route-facilities__layers">
      <span>沿途设施</span>
      <button type="button" className="route-facilities__toggle" disabled={disabled} aria-pressed={enabled}
        aria-label="Tesla 超充图层" title={disabled ? "路线生成后可查看沿途设施" : enabled ? "隐藏沿途 Tesla 超充" : "显示全程沿途 Tesla 超充"} onClick={onToggle}>
        <Image src="/tesla-mark.png" alt="" width={24} height={24} unoptimized />
      </button>
    </div>
    <div className="route-facilities__status" role="status">
      <span>{status}</span>
      {error ? <button type="button" onClick={onRetry}>重试</button> : null}
    </div>
  </section>;
}
