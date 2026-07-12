// AI [2026-07-13]: 提供 Redis 连接及应用生命周期管理
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
@Injectable()
export class RedisService
  extends Redis
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    super(config.getOrThrow<string>("REDIS_URL"));
  }
  async onModuleInit() {
    await this.ping();
  }
  async onModuleDestroy() {
    await this.quit();
  }
}
