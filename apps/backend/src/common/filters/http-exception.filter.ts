// AI [2026-07-13]: 统一格式化 HTTP 异常响应并记录服务端错误
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private logger = new Logger("Exception");
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp(),
      res = ctx.getResponse<Response>(),
      req = ctx.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      exception instanceof HttpException
        ? exception.message
        : "Internal server error";
    if (status >= 500)
      this.logger.error(
        `${req.method} ${req.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    res.status(status).json({ statusCode: status, message, path: req.url });
  }
}
