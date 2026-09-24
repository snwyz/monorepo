import type {
  FeaturedDrivingRoute,
  FeaturedRouteCategory,
  FeaturedRoadCode,
  FeaturedRouteControlPoint,
  FeaturedRouteControlPointKind,
  FeaturedRouteRoad,
} from "@/domain/featured-driving-route/model";

const goldenGrandLoop: FeaturedDrivingRoute = {
  id: "china-golden-grand-loop",
  name: "黄金大环线",
  eyebrow: "环中国公路概览",
  description: "以 G331、G219 与 G228 为骨架，串联中国北部边境、西部边境与东部海岸线。",
  previewImageSrc: "/featured-routes/golden-grand-loop.svg",
  estimatedDistanceKilometers: 28_300,
  keywords: ["黄金大环线", "环中国", "边境", "国道", "G219", "G331", "G228"],
  roadCodes: ["G331", "G219", "G228"],
  roads: [],
  controlPoints: [],
  dataNotice: "路线依据 2022《国家公路网规划》主要控制点及地图道路规划生成；道路可能随施工与规划调整，请以实时导航为准。",
};

const featuredRoutes = [goldenGrandLoop];

interface GeometryControlPoint {
  name: string;
  regionHint: string;
  district: string;
  latitude: number;
  longitude: number;
}

interface GeometryRoad extends Omit<FeaturedRouteRoad, "labelPoints"> {
  controls: GeometryControlPoint[];
}

interface GeometryPayload {
  schemaVersion: number;
  coordinateSystem: string;
  roads: GeometryRoad[];
}

const scenicControlPointNames = new Set(["喀纳斯"]);
const portControlPointNames = new Set(["塔克什肯", "黄骅港", "射阳港", "大丰港"]);

function classifyControlPoint(name: string): FeaturedRouteControlPointKind {
  if (scenicControlPointNames.has(name)) return "scenic";
  if (portControlPointNames.has(name)) return "port";
  return "county-city";
}

function createRoadLabelPoints(controls: GeometryControlPoint[]) {
  const interval = controls.length >= 70 ? 10 : controls.length >= 50 ? 7 : 6;
  const offset = Math.floor(interval / 2);
  return controls.filter((_, index) => (
    index === offset || (index > offset && (index - offset) % interval === 0)
  )).map(({ latitude, longitude }) => ({ latitude, longitude }));
}

function hydrateGeometry(payload: GeometryPayload) {
  const roads: FeaturedRouteRoad[] = payload.roads.map((road) => ({
    id: road.id,
    code: road.code,
    style: road.style,
    path: road.path,
    labelPoints: createRoadLabelPoints(road.controls),
  }));
  const controlPoints: FeaturedRouteControlPoint[] = payload.roads.flatMap((road) => (
    road.controls.map((control, index) => ({
      id: `${road.code.toLowerCase()}-control-${index + 1}`,
      name: control.name,
      region: control.regionHint || control.district,
      roadCode: road.code as FeaturedRoadCode,
      kind: classifyControlPoint(control.name),
      latitude: control.latitude,
      longitude: control.longitude,
    }))
  ));
  return { roads, controlPoints };
}

function isGeometryPayload(value: unknown): value is GeometryPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<GeometryPayload>;
  if (
    payload.schemaVersion !== 1
    || payload.coordinateSystem !== "gcj02"
    || !Array.isArray(payload.roads)
  ) return false;
  return payload.roads.length === 3 && payload.roads.every((road) => (
    road
    && ["G219", "G331", "G228"].includes(road.code)
    && ["g219", "g331", "g228"].includes(road.style)
    && Array.isArray(road.path)
    && road.path.length >= 100
    && Array.isArray(road.controls)
    && road.controls.length >= 30
    && road.controls.every((control) => (
      typeof control.name === "string"
      && typeof control.regionHint === "string"
      && typeof control.district === "string"
      && Number.isFinite(control.latitude)
      && Number.isFinite(control.longitude)
    ))
    && road.path.every((point) => (
      Number.isFinite(point.latitude)
      && Number.isFinite(point.longitude)
    ))
  ));
}

export class StaticFeaturedDrivingRouteRepository {
  private geometryRequest: Promise<ReturnType<typeof hydrateGeometry>> | null = null;

  list() {
    return featuredRoutes;
  }

  findById(id: string) {
    return featuredRoutes.find((route) => route.id === id) ?? null;
  }

  async loadById(id: string) {
    const route = this.findById(id);
    if (!route) return null;
    this.geometryRequest ??= fetch(
      "/featured-routes/golden-grand-loop-geometry.json",
      { cache: "force-cache" },
    ).then(async (response) => {
      if (!response.ok) throw new Error("热门路线数据加载失败，请稍后重试");
      const payload: unknown = await response.json();
      if (!isGeometryPayload(payload)) throw new Error("热门路线数据格式无效");
      return hydrateGeometry(payload);
    }).catch((error) => {
      this.geometryRequest = null;
      throw error;
    });
    return { ...route, ...await this.geometryRequest };
  }

  search(query: string) {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return this.list();
    return featuredRoutes.filter((route) => (
      [route.name, route.description, ...route.keywords]
        .join(" ")
        .toLocaleLowerCase("zh-CN")
        .includes(normalized)
    ));
  }

  categories(): FeaturedRouteCategory[] {
    return [
      { id: "loop", label: "环线", query: "环线", count: 1 },
      { id: "border", label: "边境", query: "边境", count: 1 },
      { id: "national-road", label: "国道", query: "国道", count: 1 },
      { id: "g219", label: "G219", query: "G219", count: 1 },
      { id: "g331", label: "G331", query: "G331", count: 1 },
      { id: "g228", label: "G228", query: "G228", count: 1 },
    ];
  }
}
