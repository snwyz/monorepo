// AI [2026-07-13]: 校验附近路线搜索所需的坐标与半径参数
import { Type } from "class-transformer";
import { IsNumber, IsOptional, Max, Min } from "class-validator";
export class NearbyQueryDto {
  @Type(() => Number) @IsNumber() lat!: number;
  @Type(() => Number) @IsNumber() lng!: number;
  @Type(() => Number) @IsNumber() @Min(1) @Max(2000) radius_km!: number;
  @Type(() => Number) @IsNumber() @IsOptional() min_lat?: number;
  @Type(() => Number) @IsNumber() @IsOptional() max_lat?: number;
  @Type(() => Number) @IsNumber() @IsOptional() min_lng?: number;
  @Type(() => Number) @IsNumber() @IsOptional() max_lng?: number;
}
