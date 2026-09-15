// AI [2026-07-13]: 注册 COS 文件存储模块
import { Module } from "@nestjs/common";
import { StorageController } from "./storage.controller";
import { StorageService } from "./storage.service";
@Module({ providers: [StorageService], controllers: [StorageController] })
export class StorageModule {}
