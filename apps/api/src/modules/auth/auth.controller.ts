// AI [2026-07-13]: 暴露微信登录、刷新令牌和登出接口
import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { IsNotEmpty, IsString } from "class-validator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AuthService } from "./auth.service";
import { WxLoginDto } from "./dto/wx-login.dto";
class RefreshDto {
  @IsString() @IsNotEmpty() refresh_token!: string;
}
@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}
  @Post("wx-login") @HttpCode(200) wxLogin(@Body() dto: WxLoginDto) {
    return this.auth.wxLogin(dto.code);
  }
  @Post("refresh") @HttpCode(200) refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refresh_token);
  }
  @UseGuards(JwtAuthGuard) @Post("logout") @HttpCode(200) logout(
    @Body() dto: RefreshDto,
    @CurrentUser() _user: unknown,
  ) {
    return this.auth.logout(dto.refresh_token);
  }
}
