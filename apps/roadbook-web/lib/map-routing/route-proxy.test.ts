import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as amapRoute } from "@/app/api/amap/route/route";
import { GET as tencentRoute } from "@/app/api/tencent-map/route/route";
import { requestAmapWebService } from "@/lib/amap/amap-web-service";
import { requestTencentMapWebService } from "@/lib/tencent-map/tencent-map-web-service";

vi.mock("@/lib/amap/amap-web-service", () => ({ requestAmapWebService: vi.fn() }));
vi.mock("@/lib/tencent-map/tencent-map-web-service", () => ({ requestTencentMapWebService: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
const request = (mode: string, from = "30,104") => new NextRequest(`http://localhost/api/route?from=${from}&to=30.01,104.01&mode=${mode}&strategy=19&policy=LEAST_TIME,REAL_TRAFFIC`);

describe("交通方式服务代理", () => {
  it("拒绝非法坐标和模式，不向供应商发出请求", async () => {
    for (const get of [amapRoute, tencentRoute]) {
      expect((await get(request("bus"))).status).toBe(400);
      expect((await get(request("walking", "91,104"))).status).toBe(400);
    }
    expect(requestAmapWebService).not.toHaveBeenCalled();
    expect(requestTencentMapWebService).not.toHaveBeenCalled();
  });
  it("高德骑行 v4 字段归一化，正确转换经纬度且不传驾车策略", async () => {
    vi.mocked(requestAmapWebService).mockResolvedValue({ ok: true, data: { errcode: 0, data: { paths: [{ duration: 600, distance: 2000 }] } } });
    const result = await amapRoute(request("cycling"));
    expect(await result.json()).toEqual({ status: "1", info: "OK", route: { paths: [{ duration: 600, distance: 2000 }] } });
    expect(requestAmapWebService).toHaveBeenCalledWith("/v4/direction/bicycling", { origin: "104,30", destination: "104.01,30.01" });
  });
  it("供应商骑行错误按失败返回，不制造有效路线", async () => {
    vi.mocked(requestAmapWebService).mockResolvedValue({ ok: true, data: { errcode: 30005, errmsg: "距离超限" } });
    const result = await amapRoute(request("cycling"));
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({ status: "0", info: "距离超限" });
  });
  it("腾讯步骑使用专用路径，坐标维持纬度在前，剥离驾车策略", async () => {
    vi.mocked(requestTencentMapWebService).mockResolvedValue({ ok: true, data: { status: 0, result: { routes: [] } } });
    for (const mode of ["walking", "cycling"]) await tencentRoute(request(mode));
    expect(requestTencentMapWebService).toHaveBeenNthCalledWith(1, "/ws/direction/v1/walking/", { from: "30,104", to: "30.01,104.01" });
    expect(requestTencentMapWebService).toHaveBeenNthCalledWith(2, "/ws/direction/v1/bicycling/", { from: "30,104", to: "30.01,104.01" });
  });
});
