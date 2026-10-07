import { analyzeElevation } from "../../domain/elevation-analysis/analyze";
import type { ElevationSample } from "../../domain/elevation-analysis/model";

const scope = self as unknown as { onmessage: ((event: MessageEvent<ElevationSample[]>) => void) | null; postMessage: (value: unknown) => void };
scope.onmessage = (event) => {
  try { scope.postMessage({ profile: analyzeElevation(event.data) }); }
  catch { scope.postMessage({ message: "高程分析未完成，请重试" }); }
};
