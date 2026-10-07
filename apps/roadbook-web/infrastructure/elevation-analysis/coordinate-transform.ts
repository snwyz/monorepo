import type { MapCoordinate } from "@roadbook/map/web";

function outsideChina({ latitude, longitude }: MapCoordinate) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}
// 公开近似偏移模型；数值逆解误差不等于真实坐标测量误差。
export function wgs84ToGcj02(coordinate: MapCoordinate): MapCoordinate {
  if (outsideChina(coordinate)) return { ...coordinate };
  const x = coordinate.longitude - 105; const y = coordinate.latitude - 35;
  const pi = Math.PI;
  const common = (20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2 / 3;
  let latitudeOffset = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x)) + common;
  latitudeOffset += (20 * Math.sin(y * pi) + 40 * Math.sin(y / 3 * pi)) * 2 / 3;
  latitudeOffset += (160 * Math.sin(y / 12 * pi) + 320 * Math.sin(y * pi / 30)) * 2 / 3;
  let longitudeOffset = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x)) + common;
  longitudeOffset += (20 * Math.sin(x * pi) + 40 * Math.sin(x / 3 * pi)) * 2 / 3;
  longitudeOffset += (150 * Math.sin(x / 12 * pi) + 300 * Math.sin(x / 30 * pi)) * 2 / 3;
  const latitudeRadians = coordinate.latitude * pi / 180;
  const magic = 1 - 0.006693421622965943 * Math.sin(latitudeRadians) ** 2;
  const root = Math.sqrt(magic);
  latitudeOffset = latitudeOffset * 180 / ((6378245 * (1 - 0.006693421622965943)) / (magic * root) * pi);
  longitudeOffset = longitudeOffset * 180 / (6378245 / root * Math.cos(latitudeRadians) * pi);
  return { latitude: coordinate.latitude + latitudeOffset, longitude: coordinate.longitude + longitudeOffset };
}
export function gcj02ToWgs84(coordinate: MapCoordinate): MapCoordinate {
  if (outsideChina(coordinate)) return { ...coordinate };
  let guess = { ...coordinate };
  for (let iteration = 0; iteration < 8; iteration++) {
    const projected = wgs84ToGcj02(guess);
    const latitudeError = projected.latitude - coordinate.latitude;
    const longitudeError = projected.longitude - coordinate.longitude;
    guess = { latitude: guess.latitude - latitudeError, longitude: guess.longitude - longitudeError };
    if (Math.max(Math.abs(latitudeError), Math.abs(longitudeError)) < 1e-7) break;
  }
  return guess;
}
