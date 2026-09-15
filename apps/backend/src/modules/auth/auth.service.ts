// AI [2026-07-13]: 处理微信登录、JWT 签发及 Redis 刷新令牌轮换
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomUUID } from "node:crypto";
import { DbService } from "../db/db.service";
import { RedisService } from "../redis/redis.service";
interface WxSession {
  openid?: string;
  errcode?: number;
}
@Injectable()
export class AuthService {
  constructor(
    private db: DbService,
    private redis: RedisService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}
  async wxLogin(code: string) {
    const appId = this.config.getOrThrow<string>("WECHAT_APP_ID"),
      secret = this.config.getOrThrow<string>("WECHAT_APP_SECRET");
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
    const session: WxSession = await (await fetch(url)).json();
    if (session.errcode || !session.openid)
      throw new UnauthorizedException("Invalid wx code");
    const user = await this.db.user.upsert({
      where: { openid: session.openid },
      update: {},
      create: { openid: session.openid },
    });
    return this.issueTokens(user.id, user.openid);
  }
  async refresh(refreshToken: string) {
    const hash = createHash("sha256").update(refreshToken).digest("hex"),
      userId = await this.redis.get(`refresh:${hash}`);
    if (!userId) throw new UnauthorizedException("Invalid refresh token");
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
    });
    await this.redis.del(`refresh:${hash}`);
    return this.issueTokens(user.id, user.openid);
  }
  async logout(refreshToken: string) {
    await this.redis.del(
      `refresh:${createHash("sha256").update(refreshToken).digest("hex")}`,
    );
  }
  private async issueTokens(userId: string, openid: string) {
    const access_token = this.jwt.sign(
      { sub: userId, openid },
      {
        secret: this.config.getOrThrow("JWT_ACCESS_SECRET"),
        expiresIn: this.config.getOrThrow("JWT_ACCESS_EXPIRES_IN") as "30m",
      },
    );
    const refresh_token = randomUUID();
    await this.redis.set(
      `refresh:${createHash("sha256").update(refresh_token).digest("hex")}`,
      userId,
      "EX",
      30 * 24 * 60 * 60,
    );
    return { access_token, refresh_token };
  }
}
