// AI [2026-07-13]: 定义服务端与小程序共用的日志类型
export type LogLevel = "error" | "warn" | "info" | "debug";
export interface LogContext {
  [key: string]: unknown;
}
