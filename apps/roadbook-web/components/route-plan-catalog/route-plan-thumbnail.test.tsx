import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoutePlanThumbnail } from "./route-plan-thumbnail";

describe("方案缩略图", () => {
  it("旧方案保留品牌图标；有轮廓时使用固定36px SVG且不增加无障碍朗读", () => {
    const { container, rerender } = render(<RoutePlanThumbnail />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("polyline")).toBeNull();
    rerender(<RoutePlanThumbnail thumbnail={{ inputIdentity: "identity", mapProvider: "amap", paths: [[[4, 32], [18, 4], [32, 25]]] }} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("viewBox", "0 0 36 36");
    expect(svg).toHaveAttribute("width", "36");
    expect(svg).toHaveAttribute("height", "36");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("polyline")).toHaveAttribute("points", "4,32 18,4 32,25");
    expect(container.querySelector("path")).toBeNull();
  });
});
