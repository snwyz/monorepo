// AI [2026-07-13]: 校验微信登录临时凭证请求
import { IsNotEmpty, IsString } from "class-validator";
export class WxLoginDto {
  @IsString() @IsNotEmpty() code!: string;
}
