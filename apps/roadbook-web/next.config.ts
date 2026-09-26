import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 独立生产验收目录，避免跑分构建覆盖正在运行的开发/生产服务。
  distDir: process.env.ROADBOOK_NEXT_DIST_DIR || ".next",
  async headers() {
    return [{
      source: "/featured-routes/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
    }];
  },
  transpilePackages: ["@roadbook/map"],
};

export default nextConfig;
