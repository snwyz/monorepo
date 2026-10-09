import { describe, expect, it } from "vitest";
import { createChargingStationMarkerVisual } from "../../../../packages/map/src/charging-station-marker";

describe("充电站图钉的 SDK 画布契约", () => {
  it.each([false, true])("选中=%s 时提供正整数画布且尖端不偏移", (selected) => {
    const visual = createChargingStationMarkerVisual(selected);
    expect(Number.isInteger(visual.width)).toBe(true);
    expect(Number.isInteger(visual.height)).toBe(true);
    expect(visual.width).toBeGreaterThan(0);
    expect(visual.height).toBeGreaterThan(0);
    const svg = decodeURIComponent(visual.source.split(",")[1]);
    const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
    const scale = Math.min(visual.width / Number(viewBox[1]), visual.height / Number(viewBox[2]));
    expect(scale).toBeCloseTo(2 / 3);
    expect(visual.anchor.x).toBeCloseTo(22 * scale);
    expect(visual.anchor.y).toBeCloseTo(50 * scale);
    expect(visual.anchor.x).toBeCloseTo(22 * 2 / 3);
    expect(visual.anchor.y).toBeCloseTo(50 * 2 / 3);
  });
});
