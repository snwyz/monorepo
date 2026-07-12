// AI [2026-07-13]: 验证健康检查接口可连接数据库与 Redis
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
describe("GET /api/v1/health", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
  });
  afterAll(() => app.close());
  it("returns ok", () =>
    request(app.getHttpServer())
      .get("/api/v1/health")
      .expect(200)
      .expect((res) => expect(res.body.status).toBe("ok")));
});
