// AI [2026-07-13]: 启动带版本前缀与跨域支持的 NestJS API 服务
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
