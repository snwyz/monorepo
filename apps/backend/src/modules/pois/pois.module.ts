// AI [2026-07-13]: 注册 POI 业务模块
import { Module } from "@nestjs/common";
import { PoisController } from "./pois.controller";
import { PoisService } from "./pois.service";
@Module({ providers: [PoisService], controllers: [PoisController] })
export class PoisModule {}
