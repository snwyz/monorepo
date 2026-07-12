// AI [2026-07-13]: 对外导出数据库客户端与 Prisma 业务类型
export { createPrismaAdapter, getPrisma } from "./client";
export { Prisma, PrismaClient } from "@prisma/client";
export type {
  User,
  Route,
  POI,
  Article,
  RouteCollection,
  Difficulty,
  RouteStatus,
  PoiType,
  ArticleStatus,
} from "@prisma/client";
