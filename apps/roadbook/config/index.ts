// AI [2026-07-13]: 配置 Taro 微信小程序的编译入口与输出目录
import { defineConfig } from "@tarojs/cli";
import { resolve } from "node:path";

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
  vite: {
    resolve: {
      alias: {
        "@roadbook/monitor/client": resolve(__dirname, "../../../packages/monitor/src/client/index.ts"),
      },
    },
  },
  mini: {},
});
