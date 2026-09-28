import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface RouteCalculationFeedbackProps {
  controlPointCount: number;
  onCancel: () => void;
}

export function RouteCalculationFeedback({ controlPointCount, onCancel }: RouteCalculationFeedbackProps) {
  return (
    <section data-glass="surface" className="route-calculation-feedback widget" role="status" aria-live="polite">
      <span className="route-calculation-feedback__icon">
        <Spinner />
      </span>
      <span className="route-calculation-feedback__copy">
        <strong>正在生成规划路线</strong>
        <small>正在连接 {controlPointCount} 个控制点，请稍候</small>
      </span>
      <Button type="button" variant="ghost" size="icon" className="route-calculation-feedback__cancel" aria-label="取消路线生成" title="取消路线生成" onClick={onCancel}>
        <X aria-hidden="true" size={18} />
      </Button>
    </section>
  );
}
