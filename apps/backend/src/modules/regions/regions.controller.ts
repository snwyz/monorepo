import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { ProvinceSyncDto } from "./dto/province-sync.dto";
import { RegionsService } from "./regions.service";

@Controller("regions")
export class RegionsController {
  constructor(private readonly regions: RegionsService) {}

  @Get()
  async findDistricts(@Query("province_code") provinceCode: string) {
    return { data: await this.regions.findDistricts(provinceCode) };
  }

  @Post("sync")
  @HttpCode(200)
  async syncProvince(@Body() dto: ProvinceSyncDto) {
    return { data: await this.regions.syncProvinceFromTencent(dto.province_code) };
  }
}
