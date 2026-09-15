// AI [2026-07-13]: 从请求上下文注入当前认证用户
import { createParamDecorator, ExecutionContext } from "@nestjs/common";
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest().user as { id: string; openid: string },
);
