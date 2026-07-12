// AI [2026-07-13]: 为授权用户生成腾讯 COS 图片直传签名地址
import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import COS from "cos-nodejs-sdk-v5";
import { randomUUID } from "node:crypto";
const contentTypes = ["image/jpeg", "image/png", "image/webp"],
  scenes = ["routes", "pois", "articles", "avatars"];
@Injectable()
export class StorageService {
  private cos: COS;
  private bucket: string;
  private region: string;
  private publicBaseUrl: string;
  constructor(config: ConfigService) {
    this.cos = new COS({
      SecretId: config.getOrThrow("TENCENT_COS_SECRET_ID"),
      SecretKey: config.getOrThrow("TENCENT_COS_SECRET_KEY"),
    });
    this.bucket = config.getOrThrow("TENCENT_COS_BUCKET");
    this.region = config.getOrThrow("TENCENT_COS_REGION");
    this.publicBaseUrl = config.getOrThrow("TENCENT_COS_PUBLIC_BASE_URL");
  }
  async getPresignedUrl(filename: string, contentType: string, scene: string) {
    if (!contentTypes.includes(contentType))
      throw new BadRequestException("Unsupported content type");
    if (!scenes.includes(scene)) throw new BadRequestException("Invalid scene");
    const key = `${scene}/${randomUUID()}.${filename.split(".").pop() ?? "jpg"}`;
    const upload_url = await new Promise<string>((resolve, reject) =>
      this.cos.getObjectUrl(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
          Method: "PUT",
          Expires: 900,
          Sign: true,
        },
        (err, data) => (err ? reject(err) : resolve(data.Url)),
      ),
    );
    return {
      upload_url,
      object_key: key,
      public_url: `${this.publicBaseUrl}/${key}`,
    };
  }
}
