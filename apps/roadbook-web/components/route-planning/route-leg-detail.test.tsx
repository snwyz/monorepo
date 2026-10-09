import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RouteLegDetail } from "./route-leg-detail";

const from = { id: "a", name: "起点", address: "", latitude: 30, longitude: 104 };
const to = { ...from, id: "b", name: "终点", longitude: 104.1 };

describe("路段详情的交通方式", () => {
  it("默认汽车，三种方式具有原生单选语义；步行时导航参数同步", () => {
    const onModeChange = vi.fn();
    const props = { index: 0, from, to, mode: "driving" as const, provider: "amap" as const, status: "ready" as const, error: null, onModeChange, onRetry: vi.fn(), onBack: vi.fn() };
    const { rerender } = render(<RouteLegDetail {...props} />);
    expect(screen.getByRole("radio", { name: "汽车" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "步行" }));
    expect(onModeChange).toHaveBeenCalledWith("walking");
    rerender(<RouteLegDetail {...props} mode="walking" />);
    expect(screen.getByRole("radio", { name: "步行" })).toBeChecked();
    expect(screen.getByRole("link", { name: "在高德地图中步行" }).getAttribute("href")).toContain("t=2");
  });
  it("更新提示保留控件，失败允许重试且不伪装为汽车结果", () => {
    const onRetry = vi.fn();
    const props = { index: 0, from, to, mode: "cycling" as const, provider: "tencent" as const, status: "updating" as const, error: null, onModeChange: vi.fn(), onRetry, onBack: vi.fn() };
    const { rerender } = render(<RouteLegDetail {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("暂显示上次结果");
    rerender(<RouteLegDetail {...props} status="failed" error="骑行不可达" />);
    expect(screen.getByRole("status")).toHaveTextContent("骑行不可达");
    fireEvent.click(screen.getByRole("button", { name: "重新计算" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole("radio", { name: "骑行" })).toBeChecked();
    expect(screen.getByRole("link", { name: "在腾讯地图中骑行" }).getAttribute("href")).toContain("type=bike");
  });
});
