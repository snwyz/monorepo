import { createStore } from "zustand/vanilla";
import type { WebMapAdapter, WebMapProvider } from "@roadbook/map/web";

export function createMapConnection(connect: (provider: WebMapProvider) => Promise<WebMapAdapter>) {
  const state = createStore<{
    provider: WebMapProvider;
    adapter: WebMapAdapter | null;
    status: "loading" | "ready" | "unavailable";
    message: string;
    generation: number;
  }>(() => ({ provider: "amap", adapter: null, status: "loading", message: "正在连接高德地图…", generation: 0 }));
  let batch = 0;
  const select = (provider: WebMapProvider) => {
    const token = ++batch;
    const name = provider === "amap" ? "高德地图" : "腾讯地图";
    state.setState({ provider, adapter: null, status: "loading", message: `正在连接${name}…`, generation: token });
    void connect(provider).then((adapter) => {
      if (token === batch) state.setState({ adapter, status: "ready", message: `${name}已连接` });
    }).catch((error: unknown) => {
      if (token === batch) state.setState({ status: "unavailable", message: error instanceof Error ? error.message : `${name}暂不可用` });
    });
  };
  return { state, select, dispose: () => { batch += 1; } };
}
