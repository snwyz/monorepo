import assert from "node:assert/strict";
import test from "node:test";
import { getPaddedMapCenter, projectCoordinateToViewport } from "../src/web-viewport.ts";

test("手机半屏面板下，站点聚焦在可视地图中而非面板后方", () => {
  const coordinate = { latitude: 30.891695, longitude: 103.59128 };
  const padding = { top: 48, right: 96, bottom: 470, left: 96 };
  const center = getPaddedMapCenter(coordinate, 13, padding);
  const position = projectCoordinateToViewport(coordinate, { center, zoom: 13, width: 390, height: 844 });
  assert.ok(Math.abs(position.x - 195) < 0.01);
  assert.ok(Math.abs(position.y - 211) < 0.01);
  assert.ok(position.y < 844 - padding.bottom);
});

test("桌面聚焦避让右侧路线面板，目标仍在左侧地图区域中心", () => {
  const coordinate = { latitude: 31, longitude: 121 };
  const padding = { top: 96, right: 356, bottom: 96, left: 24 };
  const center = getPaddedMapCenter(coordinate, 14, padding);
  const position = projectCoordinateToViewport(coordinate, { center, zoom: 14, width: 1280, height: 720 });
  assert.ok(Math.abs(position.x - 474) < 0.01);
  assert.ok(Math.abs(position.y - 360) < 0.01);
});
