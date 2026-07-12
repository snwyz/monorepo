// AI [2026-07-13]: 写入路书 MVP 的系统用户、路线、POI 与文章演示数据
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  ArticleStatus,
  Difficulty,
  PoiType,
  PrismaClient,
  RouteStatus,
} from "@prisma/client";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"),
});

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const systemUser = await prisma.user.upsert({
    where: { openid: "system" },
    update: {},
    create: { openid: "system", nickname: "路书官方", avatar_url: null },
  });

  await prisma.route.upsert({
    where: { id: "seed-route-1" },
    update: {},
    create: {
      id: "seed-route-1",
      title: "稻城亚丁徒步环线",
      description: "从冲古寺出发，经珍珠海、牛奶海，至洛绒牛场的经典徒步线路。",
      difficulty: Difficulty.hard,
      distance_km: 25.5,
      duration_hours: 8,
      elevation_gain_m: 1200,
      start_lat: 28.9148,
      start_lng: 100.0742,
      end_lat: 28.9148,
      end_lng: 100.0742,
      bounds_min_lat: 28.9,
      bounds_max_lat: 29.0,
      bounds_min_lng: 100.0,
      bounds_max_lng: 100.15,
      waypoints: [
        { lat: 28.9148, lng: 100.0742 },
        { lat: 28.9312, lng: 100.0856 },
        { lat: 28.9501, lng: 100.0934 },
      ],
      polyline: [],
      region: "四川·稻城",
      tags: ["高原", "徒步", "景区"],
      status: RouteStatus.published,
      published_at: new Date(),
      author_id: systemUser.id,
    },
  });

  await prisma.route.upsert({
    where: { id: "seed-route-2" },
    update: {},
    create: {
      id: "seed-route-2",
      title: "川藏线南线（成都→拉萨）",
      description:
        "全程约2100公里，途经折多山、理塘、芒康，是最经典的自驾线路之一。",
      difficulty: Difficulty.extreme,
      distance_km: 2100,
      duration_hours: 120,
      elevation_gain_m: 4500,
      start_lat: 30.5728,
      start_lng: 104.0668,
      end_lat: 29.6519,
      end_lng: 91.1321,
      bounds_min_lat: 29.0,
      bounds_max_lat: 31.0,
      bounds_min_lng: 91.0,
      bounds_max_lng: 105.0,
      waypoints: [],
      polyline: [],
      region: "四川·西藏",
      tags: ["自驾", "川藏线", "高原"],
      status: RouteStatus.published,
      published_at: new Date(),
      author_id: systemUser.id,
    },
  });

  await prisma.pOI.createMany({
    skipDuplicates: true,
    data: [
      {
        id: "seed-poi-1",
        name: "亚丁村房车营地",
        type: PoiType.rv_camp,
        lat: 28.91,
        lng: 100.07,
        description: "位于亚丁村，提供基础水电，可容纳30辆房车。",
        images: [],
        source: "admin",
      },
      {
        id: "seed-poi-2",
        name: "稻城县城充电站",
        type: PoiType.ev_charge,
        lat: 29.0378,
        lng: 100.2984,
        description: "特来电充电桩，60kW直流快充，24小时开放。",
        images: [],
        source: "admin",
      },
      {
        id: "seed-poi-3",
        name: "理塘露营基地",
        type: PoiType.rv_camp,
        lat: 29.9944,
        lng: 100.2695,
        description: "海拔4000m，配备卫生间和热水，适合越野房车。",
        images: [],
        source: "admin",
      },
      {
        id: "seed-poi-4",
        name: "新都桥超充站",
        type: PoiType.ev_charge,
        lat: 30.0539,
        lng: 101.4776,
        description: "特斯拉超充，8个桩位，附近有餐饮。",
        images: [],
        source: "admin",
      },
    ],
  });

  await prisma.article.upsert({
    where: { id: "seed-article-1" },
    update: {},
    create: {
      id: "seed-article-1",
      title: "高原徒步前你必须了解的5件事",
      content: "## 高反不是开玩笑\n\n海拔超过3000m时，身体需要时间适应...",
      cover_image_url: null,
      status: ArticleStatus.published,
      published_at: new Date(),
      author_id: systemUser.id,
    },
  });

  console.log("Seed complete");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
