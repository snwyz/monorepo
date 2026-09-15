// AI [2026-07-13]: 校验访问令牌并提取当前微信用户身份
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
export interface JwtPayload {
  sub: string;
  openid: string;
}
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>("JWT_ACCESS_SECRET"),
    });
  }
  async validate(payload: JwtPayload) {
    if (!payload.sub) throw new UnauthorizedException();
    return { id: payload.sub, openid: payload.openid };
  }
}
