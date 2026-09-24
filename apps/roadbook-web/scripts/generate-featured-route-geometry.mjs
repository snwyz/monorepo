import { readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.env.ROADBOOK_LOCAL_URL ?? "http://127.0.0.1:3000";
const outputPath = resolve(
  process.cwd(),
  "public/featured-routes/golden-grand-loop-geometry.json",
);
const cachePath = `${outputPath}.cache`;
const minimumRequestIntervalMilliseconds = 400;
let lastRequestAt = 0;

async function readCache() {
  try {
    return JSON.parse(await readFile(cachePath, "utf8"));
  } catch {
    return { geocodes: {}, segments: {} };
  }
}

const generationCache = await readCache();

async function saveCache() {
  await writeFile(cachePath, `${JSON.stringify(generationCache)}\n`, "utf8");
}

const routeDefinitions = [
  {
    id: "golden-grand-loop-g331",
    code: "G331",
    style: "g331",
    controls: [
      ["丹东", "辽宁"], ["集安", "吉林"], ["临江", "吉林"], ["长白", "吉林"],
      ["图们", "吉林"], ["珲春", "吉林"], ["东宁", "黑龙江"], ["绥芬河", "黑龙江"],
      ["穆棱", "黑龙江"], ["鸡西", "黑龙江"], ["密山", "黑龙江"], ["虎林", "黑龙江"],
      ["饶河", "黑龙江"], ["抚远", "黑龙江"], ["同江", "黑龙江"], ["萝北", "黑龙江"],
      ["嘉荫", "黑龙江"], ["逊克", "黑龙江"], ["黑河", "黑龙江"], ["呼玛", "黑龙江"],
      ["漠河", "黑龙江"], ["额尔古纳", "内蒙古"], ["满洲里", "内蒙古"],
      ["新巴尔虎右旗", "内蒙古"], ["新巴尔虎左旗", "内蒙古"], ["阿尔山", "内蒙古"],
      ["东乌珠穆沁旗", "内蒙古"], ["阿巴嘎旗", "内蒙古"], ["苏尼特左旗", "内蒙古"],
      ["二连浩特", "内蒙古"], ["额济纳旗", "内蒙古"], ["塔克什肯", "新疆"],
      ["青河", "新疆"], ["富蕴", "新疆"], ["阿勒泰", "新疆"], ["布尔津", "新疆"],
      ["哈巴河", "新疆"],
    ],
  },
  {
    id: "golden-grand-loop-g219",
    code: "G219",
    style: "g219",
    controls: [
      ["喀纳斯", "新疆"], ["哈巴河", "新疆"], ["吉木乃", "新疆"], ["和布克赛尔", "新疆"],
      ["裕民", "新疆"], ["博乐", "新疆"], ["温泉", "新疆博尔塔拉"], ["昭苏", "新疆"],
      ["温宿", "新疆"], ["乌什", "新疆"], ["阿合奇", "新疆"], ["伽师", "新疆"],
      ["岳普湖", "新疆"], ["英吉沙", "新疆"], ["莎车", "新疆"], ["泽普", "新疆"],
      ["叶城", "新疆"], ["日土", "西藏"], ["噶尔", "西藏"], ["仲巴", "西藏"],
      ["萨嘎", "西藏"], ["吉隆", "西藏"], ["定日", "西藏"], ["定结", "西藏"],
      ["岗巴", "西藏"], ["洛扎", "西藏"], ["措美", "西藏"], ["隆子", "西藏"],
      ["米林", "西藏"], ["墨脱", "西藏"], ["察隅", "西藏"], ["贡山", "云南"],
      ["福贡", "云南"], ["泸水", "云南"], ["腾冲", "云南"], ["龙陵", "云南"],
      ["永德", "云南"], ["镇康", "云南"], ["沧源", "云南"], ["西盟", "云南"],
      ["孟连", "云南"], ["澜沧", "云南"], ["勐海", "云南"], ["景洪", "云南"],
      ["江城", "云南"], ["绿春", "云南"], ["金平", "云南"], ["屏边", "云南"],
      ["马关", "云南"], ["西畴", "云南"], ["凭祥", "广西"], ["东兴", "广西"],
    ],
  },
  {
    id: "golden-grand-loop-g228",
    code: "G228",
    style: "g228",
    controls: [
      ["丹东", "辽宁"], ["东港", "辽宁"], ["庄河", "辽宁"], ["大连", "辽宁"],
      ["营口", "辽宁"], ["葫芦岛", "辽宁"], ["秦皇岛", "河北"], ["乐亭", "河北"],
      ["唐海", "河北"], ["天津滨海新区", "天津"], ["黄骅港", "河北"], ["滨州", "山东"],
      ["东营", "山东"], ["莱州", "山东"], ["龙口", "山东"], ["蓬莱", "山东"],
      ["烟台", "山东"], ["威海", "山东"], ["荣成", "山东"], ["文登", "山东"],
      ["乳山", "山东"], ["海阳", "山东"], ["即墨", "山东"], ["城阳", "山东青岛"],
      ["胶州", "山东"], ["黄岛", "山东青岛"], ["日照", "山东"], ["赣榆", "江苏"],
      ["连云", "江苏连云港"], ["射阳港", "江苏"], ["大丰港", "江苏"], ["如东", "江苏"],
      ["海门", "江苏"], ["启东", "江苏"], ["崇明", "上海"], ["上海浦东新区", "上海"],
      ["奉贤", "上海"], ["金山", "上海"], ["平湖", "浙江"], ["海盐", "浙江"],
      ["慈溪", "浙江"], ["余姚", "浙江"], ["宁波", "浙江"], ["奉化", "浙江"],
      ["宁海", "浙江"], ["台州", "浙江"], ["温岭", "浙江"], ["玉环", "浙江"],
      ["乐清", "浙江"], ["霞浦", "福建"], ["宁德", "福建"], ["长乐", "福建"],
      ["福清", "福建"], ["泉州", "福建"], ["厦门", "福建"], ["云霄", "福建"],
      ["诏安", "福建"], ["饶平", "广东"], ["汕头", "广东"], ["陆丰", "广东"],
      ["汕尾", "广东"], ["惠阳", "广东惠州"], ["深圳", "广东"], ["中山", "广东"],
      ["珠海", "广东"], ["台山", "广东"], ["阳江", "广东"], ["阳西", "广东"],
      ["电白", "广东"], ["吴川", "广东"], ["湛江", "广东"], ["雷州", "广东"],
      ["北海", "广西"], ["防城港", "广西"], ["东兴", "广西"],
    ],
  },
];

const sleep = (milliseconds) => new Promise((resolveSleep) => {
  setTimeout(resolveSleep, milliseconds);
});

async function getJson(pathname, parameters, successStatus = "1") {
  const url = new URL(pathname, baseUrl);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  let response;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < minimumRequestIntervalMilliseconds) {
      await sleep(minimumRequestIntervalMilliseconds - elapsed);
    }
    lastRequestAt = Date.now();
    response = await fetch(url);
    if (response.ok || response.status < 500 || attempt === 3) break;
    await sleep(1_200 * attempt);
  }
  if (!response?.ok) throw new Error(`${url.pathname} 请求失败：${response?.status ?? "无响应"}`);
  const result = await response.json();
  if (String(result.status) !== successStatus) {
    throw new Error(
      `${url.pathname} 返回失败：${result.info ?? result.message ?? `状态 ${result.status}`}`,
    );
  }
  return result;
}

function parseLocation(location) {
  const [longitude, latitude] = location.split(",").map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

async function geocodeControl([name, regionHint]) {
  const cacheKey = `${regionHint}|${name}`;
  if (generationCache.geocodes[cacheKey]) return generationCache.geocodes[cacheKey];
  const queryOverrides = {
    "云南|江城": "云南普洱江城哈尼族彝族自治县人民政府",
    "云南|金平": "云南红河金平苗族瑶族傣族自治县人民政府",
  };
  const result = await getJson("/api/tencent-map/suggestion", {
    q: queryOverrides[cacheKey]
      ?? `${regionHint}${name}${name.endsWith("港") || name === "喀纳斯" ? "" : "人民政府"}`,
  }, "0");
  const candidates = (result.data ?? []).filter((tip) => (
    Number.isFinite(tip.location?.lat) && Number.isFinite(tip.location?.lng)
  ));
  const matched = candidates.find((tip) => (
    `${tip.province ?? ""}${tip.city ?? ""}${tip.district ?? ""}`
      .includes(regionHint.replace(/博尔塔拉|青岛|连云港|惠州/u, ""))
  )) ?? candidates[0];
  if (!matched) throw new Error(`无法解析控制点：${regionHint}${name}`);
  const control = {
    name,
    regionHint,
    district: `${matched.province ?? ""}${matched.city ?? ""}${matched.district ?? ""}`,
    latitude: matched.location.lat,
    longitude: matched.location.lng,
  };
  generationCache.geocodes[cacheKey] = control;
  await saveCache();
  return control;
}

function decodePath(path) {
  const points = [];
  for (const step of path.steps ?? []) {
    for (const text of String(step.polyline ?? "").split(";")) {
      const point = parseLocation(text);
      if (!point) continue;
      const previous = points.at(-1);
      if (
        previous
        && previous.latitude === point.latitude
        && previous.longitude === point.longitude
      ) continue;
      points.push(point);
    }
  }
  return points;
}

function routeScore(path, code) {
  const number = code.slice(1);
  return (path.steps ?? []).reduce((score, step) => {
    const road = String(step.road ?? "");
    const distance = Number(step.distance ?? 0);
    if (road.includes(`${number}国道`) || road.toUpperCase().includes(code)) {
      return score + distance * 100;
    }
    if (/国道|丹阿线|喀东线|丹东线/u.test(road)) return score + distance * 4;
    if (/高速/u.test(road)) return score - distance * 2;
    return score;
  }, 0) - Number(path.distance ?? 0) * 0.001;
}

function perpendicularDistance(point, start, end) {
  const x = point.longitude;
  const y = point.latitude;
  const x1 = start.longitude;
  const y1 = start.latitude;
  const x2 = end.longitude;
  const y2 = end.latitude;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const ratio = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x1 + ratio * dx), y - (y1 + ratio * dy));
}

function simplify(points, tolerance = 0.0015) {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let splitIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistance(points[index], points[0], points.at(-1));
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }
  if (maxDistance <= tolerance) return [points[0], points.at(-1)];
  const before = simplify(points.slice(0, splitIndex + 1), tolerance);
  const after = simplify(points.slice(splitIndex), tolerance);
  return [...before.slice(0, -1), ...after];
}

async function calculateSegment(from, to, code) {
  const cacheKey = `${code}|${from.name}|${to.name}`;
  if (generationCache.segments[cacheKey]) return generationCache.segments[cacheKey];
  const result = await getJson("/api/amap/driving", {
    from: `${from.latitude},${from.longitude}`,
    to: `${to.latitude},${to.longitude}`,
    strategy: "13",
  });
  const paths = result.route?.paths ?? [];
  if (!paths.length) throw new Error(`${code} ${from.name} → ${to.name} 没有可用道路`);
  const selected = [...paths].sort((left, right) => (
    routeScore(right, code) - routeScore(left, code)
  ))[0];
  const points = simplify(decodePath(selected));
  if (points.length < 2) throw new Error(`${code} ${from.name} → ${to.name} 几何为空`);
  const matchingDistance = (selected.steps ?? []).reduce((sum, step) => {
    const road = String(step.road ?? "");
    return road.includes(`${code.slice(1)}国道`) || road.toUpperCase().includes(code)
      ? sum + Number(step.distance ?? 0)
      : sum;
  }, 0);
  const segment = {
    points,
    distanceMeters: Number(selected.distance ?? 0),
    matchingDistance,
  };
  generationCache.segments[cacheKey] = segment;
  await saveCache();
  return segment;
}

async function generateRoad(definition) {
  process.stdout.write(`${definition.code}：解析 ${definition.controls.length} 个控制点\n`);
  const controls = [];
  for (const control of definition.controls) {
    controls.push(await geocodeControl(control));
  }
  const path = [];
  const segments = [];
  for (let index = 0; index < controls.length - 1; index += 1) {
    const from = controls[index];
    const to = controls[index + 1];
    const segment = await calculateSegment(from, to, definition.code);
    const segmentPoints = [...segment.points];
    if (path.length) segmentPoints.shift();
    path.push(...segmentPoints);
    segments.push({
      from: from.name,
      to: to.name,
      distanceMeters: segment.distanceMeters,
      matchingDistance: segment.matchingDistance,
    });
    process.stdout.write(
      `${definition.code} ${index + 1}/${controls.length - 1} ${from.name} → ${to.name}：${segmentPoints.length} 点\n`,
    );
  }
  return {
    id: definition.id,
    code: definition.code,
    style: definition.style,
    controls,
    segments,
    path,
  };
}

const roads = [];
for (const definition of routeDefinitions) roads.push(await generateRoad(definition));

const output = {
  schemaVersion: 1,
  source: "《国家公路网规划》（国家发展改革委、交通运输部，2022 年）主要控制点；高德地图驾车路线几何",
  coordinateSystem: "gcj02",
  generatedAt: new Date().toISOString(),
  roads,
};

await writeFile(outputPath, `${JSON.stringify(output)}\n`, "utf8");
await unlink(cachePath).catch(() => undefined);
process.stdout.write(`已生成 ${outputPath}\n`);
for (const road of roads) {
  const weakSegments = road.segments.filter((segment) => segment.matchingDistance === 0);
  process.stdout.write(
    `${road.code}：${road.path.length} 点，${weakSegments.length} 段未直接命中道路编号\n`,
  );
}
