// AI [2026-07-13]: 注册全局 Redis 服务
import { Global, Module } from "@nestjs/common";
import { RedisService } from "./redis.service";
@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
