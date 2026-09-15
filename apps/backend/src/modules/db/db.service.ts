// AI [2026-07-13]: 为 NestJS 提供带 Prisma 7 数据库 adapter 的客户端服务
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createPrismaAdapter, PrismaClient } from "@roadbook/db";
@Injectable()
export class DbService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ adapter: createPrismaAdapter() });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
