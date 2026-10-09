import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AmapWebAdapter, TencentMapWebAdapter, type RouteLegTravelModes, type WebMapAdapter } from "@roadbook/map/web";

const points = ["a", "b", "c"].map((id, index) => ({ id, latitude: 30 + index * 0.001, longitude: 104 + index * 0.001 }));
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("window", { setTimeout, clearTimeout }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe.each(["amap", "tencent"] as const)("%s 的混合方式算路", (provider) => {
  function setup() {
    const adapter = Reflect.construct(provider === "amap" ? AmapWebAdapter : TencentMapWebAdapter, [{}, Promise.resolve(null)]) as WebMapAdapter;
    const fetch = vi.fn(async (url: string) => {
      const params = new URL(url, "http://localhost").searchParams;
      const from = params.get("from")!.split(",").map(Number);
      const to = params.get("to")!.split(",").map(Number);
      return { ok: true, json: async () => provider === "amap"
        ? { status: "1", route: { paths: [{ distance: "1000", duration: "120", steps: [{ polyline: `${from[1]},${from[0]};${to[1]},${to[0]}` }] }] } }
        : { status: 0, result: { routes: [{ distance: 1000, duration: 2, polyline: [from[0], from[1], Math.round((to[0] - from[0]) * 1e6), Math.round((to[1] - from[1]) * 1e6)] }] } },
      };
    });
    vi.stubGlobal("fetch", fetch);
    return { adapter, fetch };
  }
  it("逐段发出正确模式，不给步骑传汽车策略，时间单位归一化", async () => {
    const { adapter, fetch } = setup();
    const pending = adapter.calculateRoute(points, "avoid-highway", "round-trip", { "b:c": "cycling", "c:a": "walking" });
    await vi.advanceTimersByTimeAsync(2000);
    const result = await pending;
    expect(result.legs.map((leg) => leg.travelMode)).toEqual(["driving", "cycling", "walking"]);
    expect(result.durationMinutes).toBe(6);
    expect(result.trafficLightCount).toBeNull();
    const urls = fetch.mock.calls.map(([url]) => new URL(url, "http://localhost"));
    expect(urls[0].pathname).toContain("driving");
    expect(urls[1].searchParams.get("mode")).toBe("cycling");
    expect(urls[2].searchParams.get("mode")).toBe("walking");
    expect(urls[1].searchParams.has("strategy")).toBe(false);
    expect(urls[1].searchParams.has("policy")).toBe(false);
  });
  it("单段编辑复用其他有效段；失败不缓存，过期后重新请求", async () => {
    const { adapter, fetch } = setup();
    const modes: RouteLegTravelModes = { "a:b": "cycling" };
    let pending = adapter.calculateRoute(points, "avoid-highway", "one-way", modes);
    await vi.advanceTimersByTimeAsync(1000); await pending;
    expect(fetch).toHaveBeenCalledTimes(2);
    pending = adapter.calculateRoute(points, "avoid-highway", "one-way", { "a:b": "walking" });
    await vi.advanceTimersByTimeAsync(1000); await pending;
    expect(fetch).toHaveBeenCalledTimes(3);
    fetch.mockRejectedValueOnce(new Error("接口失败"));
    const failed = adapter.calculateRoute(points, "avoid-highway", "one-way", {});
    const rejection = expect(failed).rejects.toThrow("接口失败");
    await vi.advanceTimersByTimeAsync(1000); await rejection;
    pending = adapter.calculateRoute(points, "avoid-highway", "one-way", {});
    await vi.advanceTimersByTimeAsync(1000); await pending;
    expect(fetch).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1);
    pending = adapter.calculateRoute(points, "avoid-highway", "one-way", {});
    await vi.advanceTimersByTimeAsync(1000); await pending;
    expect(fetch).toHaveBeenCalledTimes(7);
  });
});
