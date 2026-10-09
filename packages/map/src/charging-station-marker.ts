export const chargingStationPinPath = "M22 4C12.6 4 5 11.6 5 21c0 7.1 4.1 12.9 9.1 18.4L22 50l7.9-10.6C34.9 33.9 39 28.1 39 21 39 11.6 31.4 4 22 4Z";
export const chargingStationBoltPath = "M24.5 10 14 24h7l-1.5 10L30 20h-7l1.5-10Z";

export function createChargingStationMarkerVisual(selected = false) {
  const scale = 2 / 3;
  // SDK 图片尺寸采用整数；补齐画布留白，保持图形缩放与尖端锚点。
  const width = Math.ceil(44 * scale);
  const height = Math.ceil(54 * scale);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width / scale} ${height / scale}" preserveAspectRatio="xMidYMid meet">
    <defs><filter id="shadow" x="-30%" y="-20%" width="160%" height="150%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#75151a" flood-opacity=".22"/></filter></defs>
    <path d="${chargingStationPinPath}" fill="#ff3b40" stroke="${selected ? "#1c1c1e" : "#ffffff"}" stroke-width="${selected ? 2.5 : 1.5}" stroke-linejoin="round" filter="url(#shadow)"/>
    <path d="${chargingStationBoltPath}" fill="#ffffff"/>
  </svg>`;
  return { source: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, width, height, anchor: { x: 22 * scale, y: 50 * scale } };
}
