/**
 * 高德、腾讯地图共用的规划路线与覆盖物配色。
 * 修改去程主色看 routeCore，修改返程主色看 returnRouteCore。
 * 有效去程从外到内绘制：白色隔离层 → 深青边界 → 松石青内芯。
 * 使用完整的六位十六进制色值（#RRGGBB），腾讯地图会据此计算未选中路段的透明色。
 * 热门路线 G219／G331／G228 的配色在 featured-route-label.ts 中单独维护。
 */
export const mapOverlayColors = {
  // 共用白色：路线最外层隔离描边、插点引导描边、控制点白底／选中文字和定位点白环。
  surface: "#ffffff",
  // 未选中控制点标签的地点名称文字。
  textStrong: "#1c1c1e",
  // 去程内芯外侧的深青边界与路名文字描边；也用于选中路段的插点引导线。
  routeBoundary: "#00656d",
  // 有效去程的深松石青内芯；普通和选中路段共用，不表示实时路况。
  routeCore: "#008d95",
  // 有效返程的蓝色主线与内芯；普通和选中路段共用。
  returnRouteCore: "#1297ff",
  // 地图控制点标签的边框、编号徽标与选中背景，不控制地址列表的 CSS 配色。
  controlPointAccent: "#0a84ff",
  // 地图上的用户位置点与精度光晕；屏幕中心点的颜色另由 Web CSS 维护。
  location: "#0a84ff",
  // 重新算路期间保留的旧路线：灰色虚线，不绘制有效路线内芯。
  staleRoute: "#8e8e93",
  // 计算失败或不可达路段：红色虚线，不绘制有效路线内芯。
  failedRoute: "#ff3b30",
} as const;

/**
 * 路线基准线宽，单位为屏幕像素，不是地理距离。
 * 有效路线需保持 outline > boundary > core，才能同时看见三层颜色。
 * normal／selected 为缩放层级 ≤ 12 时的宽度，近景增宽见下方函数。
 */
export const plannedRouteStrokeWidths = {
  // 普通有效路段。
  normal: {
    outline: 14, // 最外层白色隔离描边的总宽度。
    boundary: 11, // 中间边界层的总宽度：去程深青边界、返程蓝色主线。
    core: 7, // 最上层内芯的总宽度：去程松石青、返程蓝。
  },
  // 当前选中的有效路段，三层同时加粗以突出所选道路。
  selected: {
    outline: 22, // 选中路段的白色隔离描边。
    boundary: 18, // 选中路段的边界层。
    core: 12, // 选中路段的内芯。
  },
  // 更新中的旧路线，仅绘制白色描边和灰色虚线。
  stale: {
    outline: 9, // 白色隔离描边。
    route: 4, // 灰色虚线主线。
  },
  // 失败路段，仅绘制白色描边和红色虚线。
  failed: {
    outline: 9, // 白色隔离描边。
    route: 5, // 红色虚线主线。
  },
} as const;

/**
 * 根据地图缩放层级计算实际线宽，为近景的固定字号路名留出空间。
 * ≤ 12 级使用基准宽度；12～14 级渐进增宽；≥ 14 级各有效路线层增加 9px。
 * 三层增加相同宽度，保留层间宽差；旧路线与失败路段保持基准宽度。
 */
export function getPlannedRouteStrokeWidths(zoom: number) {
  const progress = Math.max(0, Math.min(1, (zoom - 12) / 2));
  const growth = Math.round(progress * 9);
  return {
    normal: {
      outline: plannedRouteStrokeWidths.normal.outline + growth,
      boundary: plannedRouteStrokeWidths.normal.boundary + growth,
      core: plannedRouteStrokeWidths.normal.core + growth,
    },
    selected: {
      outline: plannedRouteStrokeWidths.selected.outline + growth,
      boundary: plannedRouteStrokeWidths.selected.boundary + growth,
      core: plannedRouteStrokeWidths.selected.core + growth,
    },
    stale: plannedRouteStrokeWidths.stale,
    failed: plannedRouteStrokeWidths.failed,
  };
}
