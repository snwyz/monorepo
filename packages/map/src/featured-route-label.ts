import type {
  WebMapFeaturedRoadStyle,
  WebMapFeaturedRouteControlPoint,
  WebMapFeaturedRouteMarker,
} from "./web-types";

export interface FeaturedRouteLabelVisual {
  source: string;
  width: number;
  height: number;
  anchor: { x: number; y: number };
}

const roadColors: Record<WebMapFeaturedRoadStyle, string> = {
  g219: "#bf5af2",
  g331: "#ff375f",
  g228: "#0a84ff",
};

const roadLabelTextColors: Record<WebMapFeaturedRoadStyle, string> = {
  g219: "#7f2cbd",
  g331: "#c90f46",
  g228: "#0066cc",
};

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function displayName(value: string, limit = 7) {
  const characters = Array.from(value.trim() || "未命名地点");
  return characters.length > limit
    ? `${characters.slice(0, limit).join("")}…`
    : characters.join("");
}

function approximateWidth(value: string) {
  return Array.from(value).reduce((width, character) => (
    width + (character.codePointAt(0)! <= 0xff ? 6 : 11)
  ), 0);
}

export function featuredRoadColor(style: WebMapFeaturedRoadStyle) {
  return roadColors[style];
}

export function createFeaturedRoadLabelVisual(
  road: { code: string; style: WebMapFeaturedRoadStyle },
): FeaturedRouteLabelVisual {
  const color = featuredRoadColor(road.style);
  const textColor = roadLabelTextColors[road.style];
  const code = escapeSvgText(road.code);
  const width = Math.ceil(approximateWidth(road.code) + 24);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="30" viewBox="0 0 ${width} 30">
    <defs><filter id="shadow" x="-30%" y="-50%" width="160%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#1c1c1e" flood-opacity=".18"/></filter></defs>
    <rect x="2" y="2" width="${width - 4}" height="26" rx="13" fill="#ffffff" fill-opacity=".94" stroke="${color}" stroke-width="2" filter="url(#shadow)"/>
    <text x="${width / 2}" y="15.5" dominant-baseline="middle" text-anchor="middle" fill="${textColor}" font-family="Arial,sans-serif" font-size="12" font-weight="700">${code}</text>
  </svg>`;
  return {
    source: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    width,
    height: 30,
    anchor: { x: width / 2, y: 15 },
  };
}

export function createFeaturedControlPointLabelVisual(
  point: Pick<WebMapFeaturedRouteControlPoint, "name" | "roadCode" | "style" | "kind" | "selected">,
): FeaturedRouteLabelVisual {
  const name = displayName(point.name);
  const labelWidth = Math.ceil(41 + approximateWidth(name));
  const width = labelWidth + 16;
  const selected = Boolean(point.selected);
  const fill = selected ? "#1c1c1e" : "#ffffff";
  const text = selected ? "#ffffff" : "#17181a";
  const roadColor = featuredRoadColor(point.style);
  const badge = point.kind === "port"
    ? "口"
    : point.kind === "scenic"
      ? "景"
      : point.roadCode.replace("G", "");
  const badgeSize = point.kind === "county-city" ? 7 : 9;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="46" viewBox="0 0 ${width} 46">
    <defs><filter id="shadow" x="-20%" y="-35%" width="150%" height="180%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#1c1c1e" flood-opacity=".16"/></filter></defs>
    <line x1="8" y1="38" x2="20" y2="27" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>
    <line x1="8" y1="38" x2="20" y2="27" stroke="${roadColor}" stroke-width="2" stroke-linecap="round"/>
    <rect x="14" y="4" width="${labelWidth}" height="30" rx="15" fill="${fill}" fill-opacity=".96" stroke="${roadColor}" stroke-width="${selected ? 2.5 : 1.5}" filter="url(#shadow)"/>
    <circle cx="30" cy="19" r="7" fill="${roadColor}"/>
    <text x="30" y="19.5" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-family="Arial,'PingFang SC','Microsoft YaHei',sans-serif" font-size="${badgeSize}" font-weight="700">${escapeSvgText(badge)}</text>
    <text x="43" y="19.5" dominant-baseline="middle" fill="${text}" font-family="Arial,'PingFang SC','Microsoft YaHei',sans-serif" font-size="11" font-weight="600">${escapeSvgText(name)}</text>
  </svg>`;
  return {
    source: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    width,
    height: 46,
    anchor: { x: 8, y: 38 },
  };
}

export function createFeaturedMarkerVisual(
  marker: Pick<WebMapFeaturedRouteMarker, "name" | "selected">,
): FeaturedRouteLabelVisual {
  const name = displayName(marker.name);
  const labelWidth = Math.ceil(40 + approximateWidth(name));
  const width = labelWidth + 16;
  const selected = Boolean(marker.selected);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="46" viewBox="0 0 ${width} 46">
    <line x1="8" y1="38" x2="20" y2="27" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>
    <line x1="8" y1="38" x2="20" y2="27" stroke="#17181a" stroke-width="2" stroke-linecap="round"/>
    <rect x="14" y="4" width="${labelWidth}" height="30" rx="15" fill="${selected ? "#17181a" : "#ffffff"}" stroke="#17181a" stroke-width="${selected ? 2.5 : 1.5}"/>
    <circle cx="29" cy="19" r="6" fill="${selected ? "#ffffff" : "#17181a"}"/>
    <path d="M29 15v8M25 19h8" stroke="${selected ? "#17181a" : "#ffffff"}" stroke-width="1.5" stroke-linecap="round"/>
    <text x="42" y="19.5" dominant-baseline="middle" fill="${selected ? "#ffffff" : "#17181a"}" font-family="Arial,'PingFang SC','Microsoft YaHei',sans-serif" font-size="11" font-weight="600">${escapeSvgText(name)}</text>
  </svg>`;
  return {
    source: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    width,
    height: 46,
    anchor: { x: 8, y: 38 },
  };
}
