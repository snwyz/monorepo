export type WorkspaceSheetDetent = "compact" | "medium" | "expanded";
export const workspaceSheetDetents: WorkspaceSheetDetent[] = ["compact", "medium", "expanded"];

export function getSheetDetentHeights(availableHeight: number, maximumHeight: number) {
  const expanded = Math.max(96, maximumHeight);
  return { compact: 96, medium: Math.max(96, Math.min(expanded, availableHeight * 0.52)), expanded };
}

/** 限制惯性投射，避免短促甩动直接跨越所有档位。 */
export function settleSheetDetent(heights: Record<WorkspaceSheetDetent, number>, current: WorkspaceSheetDetent, distance: number, elapsed: number, releaseVelocity?: number): WorkspaceSheetDetent {
  const velocity = releaseVelocity ?? distance / Math.max(1, elapsed);
  const projected = heights[current] - distance - Math.max(-120, Math.min(120, velocity * 120));
  return workspaceSheetDetents.reduce((best, item) => Math.abs(heights[item] - projected) < Math.abs(heights[best] - projected) ? item : best, current);
}

/** 一次连续手势：上拉先展开后滚动，下拉先滚至顶部再收起。 */
export function consumeSheetMovement(height: number, scrollTop: number, delta: number, sizes: Record<WorkspaceSheetDetent, number>, maxScroll: number) {
  let remaining = delta;
  let nextHeight = height;
  let nextScroll = scrollTop;
  if (remaining > 0) {
    const consumed = Math.min(nextScroll, remaining);
    nextScroll -= consumed;
    remaining -= consumed;
    nextHeight = Math.max(sizes.compact, nextHeight - remaining);
  } else {
    const expansion = Math.min(sizes.expanded - nextHeight, -remaining);
    nextHeight += expansion;
    remaining += expansion;
    nextScroll = Math.min(Math.max(0, maxScroll), nextScroll - remaining);
  }
  return { height: nextHeight, scrollTop: nextScroll };
}

/** 只有正在编辑且视口明显缩小时才避让键盘；开屏工具栏变化和缩放不算键盘。 */
export function getSheetKeyboardInset(layoutHeight: number, viewport: { height: number; offsetTop: number; scale: number } | null, editing: boolean) {
  if (!editing || !viewport || Math.abs(viewport.scale - 1) > 0.01) return 0;
  const inset = Math.max(0, layoutHeight - viewport.height - viewport.offsetTop);
  return inset > 100 ? inset : 0;
}
