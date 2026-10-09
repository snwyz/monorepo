import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TencentMapWebAdapter, type WebMapAdapter } from "@roadbook/map/web";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { location: { hostname: "localhost" }, setTimeout, clearTimeout });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function setup(code: number | null, state = "granted") {
  const getCurrentPosition = vi.fn((_success: PositionCallback, failure: PositionErrorCallback) => {
    if (code !== null) failure({ code, message: "模拟浏览器定位失败", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
  });
  vi.stubGlobal("navigator", { permissions: { query: vi.fn(async () => ({ state })) }, geolocation: { getCurrentPosition } });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ status: 0, result: { location: { lat: 30, lng: 104 } } }) })));
  const adapter = Reflect.construct(TencentMapWebAdapter, [{}]) as WebMapAdapter;
  return { adapter, getCurrentPosition };
}

describe("腾讯已授权定位的可恢复失败", () => {
  it.each([1, 2, 3])("浏览器错误码 %s 保留 IP 降级且输出可诊断的警告", async (code) => {
    const { adapter } = setup(code);
    const initial = await adapter.resolveInitialLocation();
    expect(await adapter.resolveAuthorizedLocation()).toBeNull();
    expect(console.warn).toHaveBeenCalledWith("[roadbook/map][location] authorized:precise-failed", {
      error: expect.objectContaining({ code: "SERVICE_FAILED", causeCode: code, message: expect.any(String) }),
    });
    expect(await adapter.resolveCurrentLocation()).toEqual({ coordinate: initial, approximate: true });
    expect(console.error).not.toHaveBeenCalled();
  });
  it("应用超时返回 null，并释放在途请求以便再次定位", async () => {
    const { adapter, getCurrentPosition } = setup(null);
    const first = adapter.resolveAuthorizedLocation();
    await vi.advanceTimersByTimeAsync(8000);
    expect(await first).toBeNull();
    expect(console.warn).toHaveBeenCalledWith("[roadbook/map][location] authorized:precise-failed", {
      error: expect.objectContaining({ message: "获取当前位置超时" }),
    });
    const retry = adapter.resolveAuthorizedLocation();
    await vi.advanceTimersByTimeAsync(8000);
    expect(await retry).toBeNull();
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(console.error).not.toHaveBeenCalled();
  });
  it("未授权不主动请求位置，权限查询不支持时也安全跳过", async () => {
    const { adapter, getCurrentPosition } = setup(1, "prompt");
    expect(await adapter.resolveAuthorizedLocation()).toBeNull();
    vi.stubGlobal("navigator", { permissions: { query: vi.fn(async () => { throw new Error("不支持权限查询"); }) }, geolocation: { getCurrentPosition } });
    expect(await adapter.resolveAuthorizedLocation()).toBeNull();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
  it("无效位置仍保留 error，不把异常坐标当作普通定位降级", async () => {
    const { adapter, getCurrentPosition } = setup(null);
    getCurrentPosition.mockImplementation((success) => success({ coords: { latitude: NaN, longitude: 104, accuracy: 1 } } as GeolocationPosition));
    expect(await adapter.resolveAuthorizedLocation()).toBeNull();
    expect(console.error).toHaveBeenCalledWith("[roadbook/map][location] geolocation:invalid-coordinate", expect.any(Object));
  });
});
