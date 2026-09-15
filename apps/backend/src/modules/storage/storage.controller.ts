// AI [2026-07-13]: 提供认证后的 COS 上传签名接口
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { IsNotEmpty, IsString } from "class-validator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { StorageService } from "./storage.service";
class PresignedUrlDto {
  @IsString() @IsNotEmpty() filename!: string;
  @IsString() @IsNotEmpty() content_type!: string;
  @IsString() @IsNotEmpty() scene!: string;
}
@UseGuards(JwtAuthGuard)
@Controller("storage")
export class StorageController {
  constructor(private storage: StorageService) {}
  @Post("presigned-url") getPresignedUrl(@Body() dto: PresignedUrlDto) {
    return this.storage.getPresignedUrl(
      dto.filename,
      dto.content_type,
      dto.scene,
    );
  }
}
