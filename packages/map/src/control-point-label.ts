import type { WebMapControlPoint } from "./web-types";

export interface ControlPointLabelVisual {
  source: string;
  width: number;
  height: number;
  anchor: { x: number; y: number };
}

const VISUAL_HEIGHT = 64;
const ANCHOR_Y = 52;
const LABEL_HEIGHT = 36;
const LABEL_MIN_WIDTH = 64;
const LABEL_NAME_OFFSET = 33;
const LABEL_RIGHT_PADDING = 14;
const VISUAL_HORIZONTAL_PADDING = 30;
const LABEL_FONT = '700 11px Arial, "PingFang SC", "Microsoft YaHei", sans-serif';
let textMeasurementContext: CanvasRenderingContext2D | null | undefined;

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncateLabel(value: string, limit = 10) {
  const characters = Array.from(value.trim() || "未命名地点");
  return characters.length > limit
    ? `${characters.slice(0, limit).join("")}…`
    : characters.join("");
}

function approximateTextWidth(value: string) {
  return Array.from(value).reduce((width, character) => (
    width + (character.codePointAt(0)! <= 0xff ? 6.5 : 11)
  ), 0);
}

function measureTextWidth(value: string) {
  if (textMeasurementContext === undefined) {
    textMeasurementContext = typeof document === "undefined"
      ? null
      : document.createElement("canvas").getContext("2d");
  }
  if (!textMeasurementContext) return approximateTextWidth(value);
  textMeasurementContext.font = LABEL_FONT;
  return textMeasurementContext.measureText(value).width;
}

export function createControlPointLabelVisual(
  point: Pick<WebMapControlPoint, "name" | "order" | "selected">,
): ControlPointLabelVisual {
  const displayName = truncateLabel(point.name);
  const labelWidth = Math.max(
    LABEL_MIN_WIDTH,
    Math.ceil(LABEL_NAME_OFFSET + measureTextWidth(displayName) + LABEL_RIGHT_PADDING),
  );
  const visualWidth = labelWidth + VISUAL_HORIZONTAL_PADDING;
  const labelOnRight = point.order % 2 === 1;
  const anchorX = labelOnRight ? 8 : visualWidth - 8;
  const labelX = labelOnRight ? 22 : 8;
  const labelEdgeX = labelOnRight ? labelX : labelX + labelWidth;
  const badgeX = labelX + 17;
  const nameX = labelX + LABEL_NAME_OFFSET;
  const selected = Boolean(point.selected);
  const labelFill = selected ? "#0a0a0a" : "#ffffff";
  const labelText = selected ? "#ffffff" : "#1c1c1c";
  const badgeFill = selected ? "#ffffff" : "#0a0a0a";
  const badgeText = selected ? "#0a0a0a" : "#ffffff";
  const name = escapeSvgText(displayName);
  const borderWidth = selected ? 2.5 : 1.5;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${visualWidth}" height="${VISUAL_HEIGHT}" viewBox="0 0 ${visualWidth} ${VISUAL_HEIGHT}">
    <line x1="${anchorX}" y1="${ANCHOR_Y}" x2="${labelEdgeX}" y2="36" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>
    <line x1="${anchorX}" y1="${ANCHOR_Y}" x2="${labelEdgeX}" y2="36" stroke="#0a0a0a" stroke-width="1.5" stroke-linecap="round"/>
    <rect x="${labelX}" y="4" width="${labelWidth}" height="${LABEL_HEIGHT}" rx="14" fill="${labelFill}" stroke="#0a0a0a" stroke-width="${borderWidth}"/>
    <circle cx="${badgeX}" cy="22" r="11" fill="${badgeFill}"/>
    <text x="${badgeX}" y="22.5" dominant-baseline="middle" text-anchor="middle" fill="${badgeText}" font-family="Arial,sans-serif" font-size="11" font-weight="700">${point.order}</text>
    <text x="${nameX}" y="22.5" dominant-baseline="middle" fill="${labelText}" font-family="Arial,'PingFang SC','Microsoft YaHei',sans-serif" font-size="11" font-weight="700">${name}</text>
  </svg>`;

  return {
    source: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    width: visualWidth,
    height: VISUAL_HEIGHT,
    anchor: { x: anchorX, y: ANCHOR_Y },
  };
}
