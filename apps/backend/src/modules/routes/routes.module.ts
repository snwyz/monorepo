// AI [2026-07-13]: 注册路线业务模块
import { Module } from "@nestjs/common";
import { RoutesController } from "./routes.controller";
import { RoutesService } from "./routes.service";
@Module({ providers: [RoutesService], controllers: [RoutesController] })
export class RoutesModule {}
