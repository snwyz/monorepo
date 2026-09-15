// AI [2026-07-13]: 注册文章业务模块
import { Module } from "@nestjs/common";
import { ArticlesController } from "./articles.controller";
import { ArticlesService } from "./articles.service";
@Module({ providers: [ArticlesService], controllers: [ArticlesController] })
export class ArticlesModule {}
