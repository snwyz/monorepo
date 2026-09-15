// AI [2026-07-13]: 暴露数据库与 Redis 连通性健康检查接口
import { Controller, Get } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { RedisService } from "../redis/redis.service";
@Controller("health")
export class HealthController {
  constructor(
    private db: DbService,
    private redis: RedisService,
  ) {}
  @Get() async check() {
    await this.db.$queryRaw`SELECT 1`;
    await this.redis.ping();
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
