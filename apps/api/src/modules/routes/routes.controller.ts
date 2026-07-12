// AI [2026-07-13]: 暴露路线附近搜索、详情与收藏接口
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { NearbyQueryDto } from "./dto/nearby-query.dto";
import { RoutesService } from "./routes.service";
@Controller("routes")
export class RoutesController {
  constructor(private routes: RoutesService) {}
  @Get("nearby") async nearby(@Query() q: NearbyQueryDto) {
    return { data: await this.routes.findNearby(q) };
  }
  @Get(":id") findOne(
    @Param("id") id: string,
    @Request() req: { user?: { id: string } },
  ) {
    return this.routes.findOne(id, req.user?.id);
  }
  @UseGuards(JwtAuthGuard) @Post(":id/collection") @HttpCode(200) collect(
    @Param("id") id: string,
    @CurrentUser() u: { id: string },
  ) {
    return this.routes.collect(id, u.id);
  }
  @UseGuards(JwtAuthGuard) @Delete(":id/collection") @HttpCode(200) uncollect(
    @Param("id") id: string,
    @CurrentUser() u: { id: string },
  ) {
    return this.routes.uncollect(id, u.id);
  }
}
