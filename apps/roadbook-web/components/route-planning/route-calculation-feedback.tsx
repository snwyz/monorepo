import { Spinner } from "@/components/ui/spinner";

interface RouteCalculationFeedbackProps {
  controlPointCount: number;
}

export function RouteCalculationFeedback({ controlPointCount }: RouteCalculationFeedbackProps) {
  return (
    <section className="route-calculation-feedback widget" role="status" aria-live="polite">
      <span className="route-calculation-feedback__icon">
        <Spinner />
      </span>
      <span>
        <strong>正在生成规划路线</strong>
        <small>正在连接 {controlPointCount} 个控制点，请稍候</small>
      </span>
    </section>
  );
}
