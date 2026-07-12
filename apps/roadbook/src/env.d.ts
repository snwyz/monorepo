// AI [2026-07-13]: 声明 Taro 编译时注入的环境变量类型
declare const process: { env: Record<string, string | undefined> };
