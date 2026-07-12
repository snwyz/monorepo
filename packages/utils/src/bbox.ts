// AI [2026-07-13]: 判断路线与地图视野边界框是否相交
export interface BBox {
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return (
    a.min_lat <= b.max_lat &&
    a.max_lat >= b.min_lat &&
    a.min_lng <= b.max_lng &&
    a.max_lng >= b.min_lng
  );
}
