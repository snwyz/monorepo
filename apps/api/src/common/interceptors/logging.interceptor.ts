// AI [2026-07-13]: 记录每个 HTTP 请求的状态与耗时
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private logger = new Logger("HTTP");
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest(),
      start = Date.now();
    return next.handle().pipe(
      tap(() => {
        const res = ctx.switchToHttp().getResponse();
        this.logger.log(
          `${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`,
        );
      }),
    );
  }
}
