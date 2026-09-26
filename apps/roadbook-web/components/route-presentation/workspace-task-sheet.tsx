"use client";

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CloseIcon } from "@/components/ui/icons";
import { consumeSheetMovement, getSheetKeyboardInset, getSheetDetentHeights, settleSheetDetent, workspaceSheetDetents as detents, type WorkspaceSheetDetent } from "./workspace-sheet-geometry";
import "./workspace-task-sheet.css";

interface WorkspaceTaskSheetProps {
  children: ReactNode;
  pageKey: string;
  title: string;
  searchOpen: boolean;
  onBack?: () => void;
  onOcclusionChange: (height: number) => void;
}

/** 业务自行提供页面；容器只管理高度、滚动和手势，不判断路线领域状态。 */
export function WorkspaceTaskSheet({ children, pageKey, title, searchOpen, onBack, onOcclusionChange }: WorkspaceTaskSheetProps) {
  const sheetRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [detent, setDetent] = useState<WorkspaceSheetDetent>("medium");
  const [beforeSearch, setBeforeSearch] = useState<WorkspaceSheetDetent>("medium");
  const [previousSearch, setPreviousSearch] = useState(searchOpen);
  const scrollPositions = useRef<Record<string, number>>({});
  const suppressClick = useRef(false);
  const inertiaFrame = useRef(0);
  const gesture = useRef<{
    x: number; y: number; lastY: number; lastTime: number; velocity: number;
    height: number; startHeight: number; scrollTop: number; maxScroll: number; moved: boolean; axis: "x" | "y" | null;
    sizes: ReturnType<typeof getSheetDetentHeights>;
  } | null>(null);

  // 搜索是唯一主动展开的入口；退出恢复进入搜索前的用户档位。
  if (previousSearch !== searchOpen) {
    setPreviousSearch(searchOpen);
    if (searchOpen) { setBeforeSearch(detent); setDetent("expanded"); }
    else setDetent(beforeSearch);
  }

  const measurements = useCallback(() => {
    const sheet = sheetRef.current;
    const workspace = sheet?.closest<HTMLElement>(".planning-workspace");
    const keyboard = Number.parseFloat(workspace?.style.getPropertyValue("--sheet-keyboard") ?? "0") || 0;
    return getSheetDetentHeights(
      (workspace?.clientHeight ?? window.innerHeight) - keyboard,
      sheet?.offsetHeight ?? window.innerHeight - 24,
    );
  }, []);
  const workspaceElement = () => sheetRef.current?.closest<HTMLElement>(".planning-workspace");
  const syncGeometry = useCallback(() => {
    const sheet = sheetRef.current;
    const workspace = sheet?.closest<HTMLElement>(".planning-workspace");
    if (!sheet || !workspace) return;
    if (!window.matchMedia("(max-width: 760px)").matches) { onOcclusionChange(0); return; }
    const viewport = window.visualViewport;
    const editing = document.activeElement instanceof HTMLElement && document.activeElement.matches("input:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled]), [contenteditable=true]");
    const keyboard = getSheetKeyboardInset(workspace.clientHeight, viewport, editing);
    workspace.style.setProperty("--sheet-keyboard", `${keyboard}px`);
    workspace.style.setProperty("--sheet-viewport-top", `${keyboard ? viewport?.offsetTop ?? 0 : 0}px`);
    const sizes = measurements();
    workspace.style.setProperty("--sheet-visible", `${sizes[detent]}px`);
    workspace.style.setProperty("--sheet-drag", "0px");
    onOcclusionChange(sizes[detent] + (Number.parseFloat(getComputedStyle(sheet).bottom) || 0));
  }, [detent, measurements, onOcclusionChange]);

  useLayoutEffect(() => { syncGeometry(); }, [syncGeometry]);
  useEffect(() => {
    const workspace = sheetRef.current?.closest<HTMLElement>(".planning-workspace");
    let frame = 0;
    let settleTimer = 0;
    const scheduleGeometry = () => {
      workspace?.setAttribute("data-sheet-resizing", "true");
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => workspace?.removeAttribute("data-sheet-resizing"), 120);
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; syncGeometry(); });
    };
    window.addEventListener("resize", scheduleGeometry);
    window.visualViewport?.addEventListener("resize", scheduleGeometry);
    window.visualViewport?.addEventListener("scroll", scheduleGeometry);
    document.addEventListener("focusin", scheduleGeometry);
    document.addEventListener("focusout", scheduleGeometry);
    return () => {
      window.removeEventListener("resize", scheduleGeometry);
      window.visualViewport?.removeEventListener("resize", scheduleGeometry);
      window.visualViewport?.removeEventListener("scroll", scheduleGeometry);
      document.removeEventListener("focusin", scheduleGeometry);
      document.removeEventListener("focusout", scheduleGeometry);
      cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      workspace?.removeAttribute("data-sheet-resizing");
      cancelAnimationFrame(inertiaFrame.current);
    };
  }, [syncGeometry]);

  const begin = useEffectEvent((x: number, y: number, target: HTMLElement) => {
    if (!window.matchMedia("(max-width: 760px)").matches || target.closest("input, textarea, select, [contenteditable=true], [data-sheet-gesture-ignore]")) return;
    cancelAnimationFrame(inertiaFrame.current);
    const sizes = measurements();
    const body = bodyRef.current;
    const headerHeight = sheetRef.current?.querySelector(".workspace-task-sheet__navigation")?.getBoundingClientRect().height ?? 0;
    const maxScroll = Math.max(0, (body?.scrollHeight ?? 0) - (sizes.expanded - 28 - headerHeight));
    gesture.current = { scrollTop: body?.scrollTop ?? 0, maxScroll, x, y, lastY: y, lastTime: performance.now(), velocity: 0, height: sizes[detent], startHeight: sizes[detent], moved: false, axis: null, sizes };
    suppressClick.current = false;
  });
  const move = useEffectEvent((x: number, y: number, event: Event) => {
    const current = gesture.current;
    const body = bodyRef.current;
    if (!current || !body || sheetRef.current?.querySelector(".address-sequence.is-dragging")) return;
    if (!current.axis) {
      if (Math.max(Math.abs(x - current.x), Math.abs(y - current.y)) < 8) return;
      current.axis = Math.abs(x - current.x) > Math.abs(y - current.y) ? "x" : "y";
    }
    if (current.axis !== "y") return; // 横向删除、天气横滑保留给内容。
    if (event.cancelable) event.preventDefault();
    const now = performance.now();
    const delta = y - current.lastY;
    current.velocity = delta / Math.max(8, now - current.lastTime);
    current.lastY = y; current.lastTime = now; current.moved = true;
    suppressClick.current = true;
    const next = consumeSheetMovement(current.height, current.scrollTop, delta, current.sizes, current.maxScroll);
    current.height = next.height;
    current.scrollTop = next.scrollTop;
    body.scrollTop = next.scrollTop;
    const workspace = workspaceElement();
    workspace?.setAttribute("data-sheet-dragging", "true");
    workspace?.style.setProperty("--sheet-drag", `${current.startHeight - current.height}px`);
  });
  const end = useEffectEvent((cancelled = false) => {
    const current = gesture.current;
    gesture.current = null;
    if (!current) return;
    workspaceElement()?.removeAttribute("data-sheet-dragging");
    if (current.moved) {
      const distance = current.startHeight - current.height;
      const velocity = performance.now() - current.lastTime < 100 ? current.velocity : 0;
      const next = cancelled ? detent : settleSheetDetent(current.sizes, detent, distance, 10000, velocity);
      workspaceElement()?.style.setProperty("--sheet-visible", `${current.sizes[next]}px`);
      workspaceElement()?.style.setProperty("--sheet-drag", "0px");
      setDetent(next);
      onOcclusionChange(current.sizes[next] + (Number.parseFloat(getComputedStyle(sheetRef.current!).bottom) || 0));
      // 内容滚动延续松手速度；到顶停止，下一次下拉即可收起。
      if (!cancelled && next === "expanded" && Math.abs(velocity) > .12) {
        let speed = -velocity; let last = performance.now();
        const tick = (now: number) => {
          const body = bodyRef.current;
          if (!body) return;
          const dt = Math.min(32, now - last); last = now;
          const previous = body.scrollTop;
          body.scrollTop += speed * dt;
          speed *= Math.pow(.94, dt / 16);
          if (Math.abs(speed) > .02 && Math.abs(body.scrollTop - previous) > .1) inertiaFrame.current = requestAnimationFrame(tick);
        };
        inertiaFrame.current = requestAnimationFrame(tick);
      }
    }
  });
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const touchStart = (e: TouchEvent) => { if (e.touches.length === 1) begin(e.touches[0].clientX, e.touches[0].clientY, e.target as HTMLElement); else end(true); };
    const touchMove = (e: TouchEvent) => { if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY, e); };
    const touchEnd = () => end();
    const cancel = () => end(true);
    const mouseDown = (e: PointerEvent) => { if (e.pointerType === "mouse" && e.button === 0) begin(e.clientX, e.clientY, e.target as HTMLElement); };
    const mouseMove = (e: PointerEvent) => { if (e.pointerType === "mouse") move(e.clientX, e.clientY, e); };
    const mouseUp = (e: PointerEvent) => { if (e.pointerType === "mouse") end(); };
    sheet.addEventListener("touchstart", touchStart, { passive: true });
    sheet.addEventListener("touchmove", touchMove, { passive: false });
    sheet.addEventListener("touchend", touchEnd);
    sheet.addEventListener("touchcancel", cancel);
    sheet.addEventListener("pointerdown", mouseDown);
    window.addEventListener("pointermove", mouseMove);
    window.addEventListener("pointerup", mouseUp);
    window.addEventListener("blur", cancel);
    return () => {
      sheet.removeEventListener("touchstart", touchStart); sheet.removeEventListener("touchmove", touchMove);
      sheet.removeEventListener("touchend", touchEnd); sheet.removeEventListener("touchcancel", cancel);
      sheet.removeEventListener("pointerdown", mouseDown); window.removeEventListener("pointermove", mouseMove);
      window.removeEventListener("pointerup", mouseUp); window.removeEventListener("blur", cancel);
    };
  }, []);

  useLayoutEffect(() => {
    cancelAnimationFrame(inertiaFrame.current);
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTop = scrollPositions.current[pageKey] ?? 0;
  }, [pageKey]);

  return (
    <section ref={sheetRef} className="workspace-task-sheet" data-detent={detent} data-search-open={searchOpen} data-page={pageKey} aria-label="地图任务面板"
      onClickCapture={(event) => { scrollPositions.current[pageKey] = bodyRef.current?.scrollTop ?? 0; if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
      <button type="button" className="workspace-task-sheet__handle" aria-label="调整面板高度，方向键上移或下移" aria-controls="workspace-task-content" aria-expanded={detent !== "compact"}
        onClick={() => setDetent(detent === "compact" ? "medium" : "compact")}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            setDetent(detents[Math.max(0, Math.min(2, detents.indexOf(detent) + (event.key === "ArrowUp" ? 1 : -1)))]!);
          }
        }}><span /></button>
      {title && !searchOpen ? <header className="workspace-task-sheet__navigation">
        <h1>{title}</h1>
        {onBack ? <button type="button" aria-label="返回上一级" onClick={onBack}><CloseIcon /></button> : null}
      </header> : null}
      <div ref={bodyRef} id="workspace-task-content" className="workspace-task-sheet__body" onScroll={(event) => { scrollPositions.current[pageKey] = event.currentTarget.scrollTop; }}>{children}</div>
    </section>
  );
}

/** 保留桌面领域组件位置；移动端仅显示当前业务页面，避免重复挂载地图或业务状态。 */
export function WorkspaceSheetPage({ active, children, mobileOnly = false }: { active: boolean; children: ReactNode; mobileOnly?: boolean }) {
  return <div className={`workspace-sheet-page${mobileOnly ? " workspace-sheet-page--mobile" : ""}`} data-active={active}>{children}</div>;
}
