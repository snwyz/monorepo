/** 阻止地图手势触发浏览器整页缩放，事件仍交给地图 SDK。 */
export function bindMapViewportGestureGuard(container: HTMLElement) {
  const preventPageZoom = (event: Event) => {
    if (event.cancelable) event.preventDefault();
  };
  const preventMultiTouchPageZoom = (event: TouchEvent) => {
    if (event.touches.length > 1) preventPageZoom(event);
  };
  // 捕获阶段覆盖 marker 的事件隔离；非被动监听使 preventDefault 生效。
  const options = { capture: true, passive: false };
  container.addEventListener("touchstart", preventMultiTouchPageZoom, options);
  container.addEventListener("touchmove", preventMultiTouchPageZoom, options);
  container.addEventListener("gesturestart", preventPageZoom, options);
  container.addEventListener("gesturechange", preventPageZoom, options);

  return () => {
    container.removeEventListener("touchstart", preventMultiTouchPageZoom, options);
    container.removeEventListener("touchmove", preventMultiTouchPageZoom, options);
    container.removeEventListener("gesturestart", preventPageZoom, options);
    container.removeEventListener("gesturechange", preventPageZoom, options);
  };
}
