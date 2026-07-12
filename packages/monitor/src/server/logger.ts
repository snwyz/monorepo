// AI [2026-07-13]: 提供服务端 Winston 日志的统一配置
import winston from "winston";
const isDev = process.env.NODE_ENV !== "production";
export const winstonConfig: winston.LoggerOptions = {
  level: isDev ? "debug" : "info",
  format: isDev
    ? winston.format.combine(winston.format.colorize(), winston.format.simple())
    : winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
};
