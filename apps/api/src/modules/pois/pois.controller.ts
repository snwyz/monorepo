// AI [2026-07-13]: 暴露路线沿途 POI 查询接口
import { Controller, Get, Query } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { PoisService } from "./pois.service";
class NearRouteDto {
  @IsString() @IsNotEmpty() route_id!: string;
  @Type(() => Number) @IsNumber() @IsOptional() distance_km?: number;
}
@Controller("pois")
export class PoisController {
  constructor(private pois: PoisService) {}
  @Get("near-route") async nearRoute(
    @Query() dto: NearRouteDto,
  ): Promise<unknown> {
    return {
      data: await this.pois.findNearRoute(dto.route_id, dto.distance_km),
    };
  }
}
