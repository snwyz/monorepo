import { describe, expect, it } from "vitest";
import { getCoordinateFitView, areCoordinatesInsideViewport } from "../../../../packages/map/src/web-viewport";

const path = [
  { latitude: 30.657297, longitude: 104.063749 },
  { latitude: 30.6538, longitude: 104.061 },
  { latitude: 30.65699, longitude: 104.057641 },
];

describe("选中路段的可见范围", () => {
  it.each([
    [1280, 800, { top: 96, right: 356, bottom: 96, left: 24 }],
    [390, 844, { top: 48, right: 96, bottom: 459, left: 96 }],
  ] as const)("%s×%s 的真实道路全部避让业务面板", (width, height, padding) => {
    const view = getCoordinateFitView(path, width, height, padding)!;
    expect(areCoordinatesInsideViewport(path, { ...view, width, height }, padding)).toBe(true);
    expect(view.zoom).toBeGreaterThan(13);
    expect(Number.isInteger(view.zoom)).toBe(true);
  });
  it("单点限制放大，无可视区时不强行移动地图", () => {
    const padding = { top: 48, right: 96, bottom: 459, left: 96 };
    expect(getCoordinateFitView([path[0]], 390, 844, padding)?.zoom).toBe(18);
    expect(getCoordinateFitView(path, 100, 844, padding)).toBeNull();
  });
});
