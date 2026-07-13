// AI [2026-07-13]: 配置 Taro 微信小程序的编译入口与输出目录
import { defineConfig } from "@tarojs/cli";
import { resolve } from "node:path";

// 仅在 Node 构建阶段读取环境变量，避免把 process 引入小程序运行时。
const apiBaseUrl =
  process.env.TARO_APP_API_BASE_URL ?? "http://localhost:3000/api/v1";

export default defineConfig({
  projectName: "roadbook",
  date: "2026-07-13",
  designWidth: 750,
  deviceRatio: { 640: 2.34 / 2, 750: 1, 828: 1.81 / 2 },
  sourceRoot: "src",
  outputRoot: "dist",
  framework: "react",
  compiler: "vite",
  plugins: [],
  defineConstants: {
    "process.env.TARO_APP_API_BASE_URL": JSON.stringify(apiBaseUrl),
  },
  vite: {
    resolve: {
      alias: {
        "@roadbook/monitor/client": resolve(__dirname, "../../../packages/monitor/src/client/index.ts"),
      },
    },
  },
  mini: {},
});
