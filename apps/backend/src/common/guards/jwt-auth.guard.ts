// AI [2026-07-13]: 保护需登录的 API 路由
import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
