// AI [2026-07-13]: 暴露文章列表与详情读取接口
import { Controller, Get, Param, Query } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsNumber, IsOptional } from "class-validator";
import { ArticlesService } from "./articles.service";
class PaginationDto {
  @Type(() => Number) @IsNumber() @IsOptional() page?: number;
  @Type(() => Number) @IsNumber() @IsOptional() page_size?: number;
}
@Controller("articles")
export class ArticlesController {
  constructor(private articles: ArticlesService) {}
  @Get() findAll(@Query() dto: PaginationDto): Promise<unknown> {
    return this.articles.findAll(dto.page, dto.page_size);
  }
  @Get(":id") findOne(@Param("id") id: string): Promise<unknown> {
    return this.articles.findOne(id);
  }
}
