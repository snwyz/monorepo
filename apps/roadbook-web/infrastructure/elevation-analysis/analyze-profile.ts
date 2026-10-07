import { analyzeElevation } from "../../domain/elevation-analysis/analyze";
import type { ElevationProfile, ElevationSample } from "../../domain/elevation-analysis/model";

// 1000公里领域实测达到约160ms；超过5000样本时把分析移出浏览器主线程。
export function analyzeProfile(samples: ElevationSample[], signal: AbortSignal): Promise<ElevationProfile> {
  signal.throwIfAborted();
  const start = Date.now();
  const report = (mode: string) => {
    if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) console.debug("[Roadbook elevation performance]", JSON.stringify({ samples: samples.length, mode, elapsedMs: Date.now() - start }));
  };
  if (samples.length <= 5000 || typeof Worker === "undefined") { const profile = analyzeElevation(samples); report("main"); return Promise.resolve(profile); }
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try { worker = new Worker(new URL("./elevation-analysis-worker.ts", import.meta.url), { type: "module" }); }
    catch { reject(new Error("当前浏览器无法启动长路线分析，请缩短路线或稍后重试")); return; }
    const cleanup = () => { worker.terminate(); signal.removeEventListener("abort", abort); clearTimeout(timeout); };
    const abort = () => { cleanup(); reject(new Error("高程分析已取消")); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error("高程分析超时，请稍后重试")); }, 15000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ profile?: ElevationProfile; message?: string }>) => {
      cleanup();
      report("worker");
      if (event.data.profile) resolve(event.data.profile);
      else reject(new Error(event.data.message ?? "高程分析失败"));
    };
    worker.onerror = () => { cleanup(); reject(new Error("长路线分析暂不可用，请稍后重试")); };
    try { worker.postMessage(samples); }
    catch { cleanup(); reject(new Error("高程样本无法传入分析线程")); }
  });
}
