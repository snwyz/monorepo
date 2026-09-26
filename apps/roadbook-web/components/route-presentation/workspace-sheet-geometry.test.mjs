import assert from "node:assert/strict";
import test from "node:test";
import { consumeSheetMovement, getSheetDetentHeights, settleSheetDetent } from "./workspace-sheet-geometry.ts";

test("软键盘和短横屏下各档位不超出可用高度", () => {
  for (const [viewport, maximum] of [[844, 820], [375, 351], [280, 256], [160, 136]]) {
    const heights = getSheetDetentHeights(viewport, maximum);
    assert.ok(heights.compact <= heights.medium);
    assert.ok(heights.medium <= heights.expanded);
    assert.ok(heights.expanded <= maximum);
  }
});
test("点击和轻微移动不意外换档", () => {
  const heights = getSheetDetentHeights(844, 820);
  assert.equal(settleSheetDetent(heights, "medium", 0, 100), "medium");
  assert.equal(settleSheetDetent(heights, "medium", 5, 250), "medium");
});
test("上拉半屏、继续上拉全屏、下拉收起", () => {
  const heights = getSheetDetentHeights(844, 820);
  assert.equal(settleSheetDetent(heights, "compact", -300, 600), "medium");
  assert.equal(settleSheetDetent(heights, "medium", -350, 600), "expanded");
  assert.equal(settleSheetDetent(heights, "medium", 300, 600), "compact");
});
test("极端速度和越界手势只落在合法档位", () => {
  const heights = getSheetDetentHeights(844, 820);
  assert.equal(settleSheetDetent(heights, "compact", -10000, 0), "expanded");
  assert.equal(settleSheetDetent(heights, "expanded", 10000, 0), "compact");
});

test("整块面板上拉先展开，余量进入内容滚动", () => {
  const sizes = getSheetDetentHeights(844, 820);
  assert.deepEqual(consumeSheetMovement(440, 0, -500, sizes, 1000), { height: 820, scrollTop: 120 });
});
test("连续下拉先回到内容顶部，再消耗余量收起", () => {
  const sizes = getSheetDetentHeights(844, 820);
  assert.deepEqual(consumeSheetMovement(820, 120, 500, sizes, 1000), { height: 440, scrollTop: 0 });
});
test("横屏短内容和过拉不产生负滚动或越界高度", () => {
  const sizes = getSheetDetentHeights(375, 351);
  assert.deepEqual(consumeSheetMovement(351, 0, -500, sizes, -20), { height: 351, scrollTop: 0 });
  assert.deepEqual(consumeSheetMovement(351, 0, 1000, sizes, 0), { height: 96, scrollTop: 0 });
});
