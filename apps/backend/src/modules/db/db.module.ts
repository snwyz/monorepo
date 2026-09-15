// AI [2026-07-13]: 注册全局数据库服务
import { Global, Module } from "@nestjs/common";
import { DbService } from "./db.service";
@Global()
@Module({ providers: [DbService], exports: [DbService] })
export class DbModule {}
