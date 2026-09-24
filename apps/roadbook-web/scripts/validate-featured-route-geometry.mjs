import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const geometryPath = resolve(
  process.cwd(),
  "public/featured-routes/golden-grand-loop-geometry.json",
);
const payload = JSON.parse(await readFile(geometryPath, "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function distanceKilometers(from, to) {
  const earthRadius = 6_371;
  const latitudeDelta = (to.latitude - from.latitude) * Math.PI / 180;
  const longitudeDelta = (to.longitude - from.longitude) * Math.PI / 180;
  const fromLatitude = from.latitude * Math.PI / 180;
  const toLatitude = to.latitude * Math.PI / 180;
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude)
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(value)));
}

function assertControlOrder(road, names) {
  const controls = road.controls.map((control) => control.name);
  let previousIndex = -1;
  for (const name of names) {
    const index = controls.indexOf(name);
    assert(index >= 0, `${road.code} 缺少控制点：${name}`);
    assert(index > previousIndex, `${road.code} 控制点顺序错误：${name}`);
    previousIndex = index;
  }
}

assert(payload.schemaVersion === 1, "路线几何版本不受支持");
assert(payload.coordinateSystem === "gcj02", "路线几何必须使用 GCJ-02");
assert(Array.isArray(payload.roads) && payload.roads.length === 3, "路线数量必须为 3");

const minimumControlCounts = { G331: 37, G219: 52, G228: 75 };
for (const road of payload.roads) {
  assert(road.controls.length >= minimumControlCounts[road.code], `${road.code} 控制点不足`);
  assert(road.segments.length === road.controls.length - 1, `${road.code} 路段数量错误`);
  assert(road.path.length >= 1_000, `${road.code} 道路几何过于稀疏`);
  let maximumGap = 0;
  for (let index = 1; index < road.path.length; index += 1) {
    maximumGap = Math.max(
      maximumGap,
      distanceKilometers(road.path[index - 1], road.path[index]),
    );
  }
  assert(maximumGap < 35, `${road.code} 存在 ${maximumGap.toFixed(1)}km 的异常直线段`);
  process.stdout.write(
    `${road.code}：${road.controls.length} 个控制点，${road.path.length} 个道路点，最大相邻间距 ${maximumGap.toFixed(1)}km\n`,
  );
}

const roadByCode = Object.fromEntries(payload.roads.map((road) => [road.code, road]));
assertControlOrder(roadByCode.G331, [
  "丹东", "集安", "长白", "珲春", "抚远", "黑河", "漠河", "满洲里",
  "二连浩特", "额济纳旗", "阿勒泰", "哈巴河",
]);
assertControlOrder(roadByCode.G219, [
  "喀纳斯", "哈巴河", "叶城", "日土", "墨脱", "察隅", "腾冲", "东兴",
]);
assertControlOrder(roadByCode.G228, [
  "丹东", "大连", "营口", "葫芦岛", "秦皇岛", "天津滨海新区", "滨州",
  "东营", "烟台", "威海", "城阳", "上海浦东新区", "深圳", "东兴",
]);

process.stdout.write("黄金大环线路线几何校验通过\n");
