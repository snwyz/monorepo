import assert from "node:assert/strict";
import test from "node:test";
import { bindMapViewportGestureGuard } from "./map-viewport-gesture-guard.ts";

function touchEvent(type, count, cancelable = true) {
  const event = new Event(type, { cancelable, bubbles: true });
  Object.defineProperty(event, "touches", { value: { length: count } });
  return event;
}

test("双指起手和移动阻止整页缩放，事件仍传递给地图监听器", () => {
  const container = new EventTarget();
  const release = bindMapViewportGestureGuard(container);
  for (const type of ["touchstart", "touchmove"]) {
    let received = false;
    container.addEventListener(type, () => { received = true; }, { once: true });
    const event = touchEvent(type, 2);
    container.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(received, true);
  }
  release();
});

test("单指触摸、点击、滚轮及不可取消事件不受影响", () => {
  const container = new EventTarget();
  const release = bindMapViewportGestureGuard(container);
  for (const event of [
    touchEvent("touchstart", 1), touchEvent("touchmove", 1),
    touchEvent("touchmove", 2, false),
    new Event("click", { cancelable: true }),
    new Event("wheel", { cancelable: true }),
  ]) {
    container.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }
  release();
});

test("Safari 手势被取消，地图外事件不被接管，卸载后解除保护", () => {
  const container = new EventTarget();
  const outside = new EventTarget();
  const release = bindMapViewportGestureGuard(container);
  for (const type of ["gesturestart", "gesturechange"]) {
    const event = new Event(type, { cancelable: true });
    container.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  }
  const outsideEvent = touchEvent("touchmove", 2);
  outside.dispatchEvent(outsideEvent);
  assert.equal(outsideEvent.defaultPrevented, false);
  release();
  for (const type of ["touchstart", "touchmove", "gesturestart", "gesturechange"]) {
    const event = touchEvent(type, 2);
    container.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }
});
