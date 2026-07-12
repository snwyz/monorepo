// AI [2026-07-13]: 创建并复用 Prisma 数据库客户端实例
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function createPrismaAdapter(connectionUrl = process.env.DATABASE_URL) {
  if (!connectionUrl) {
    throw new Error("DATABASE_URL is required");
  }
  return new PrismaPg({ connectionString: connectionUrl });
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      adapter: createPrismaAdapter(),
      log:
        process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}
