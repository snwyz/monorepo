// AI [2026-07-13]: 初始化小程序全局错误日志与页面容器
import { PropsWithChildren, useEffect } from "react";
import { setupGlobalErrorCapture } from "@roadbook/monitor/client";
import "./app.css";
export default function App({ children }: PropsWithChildren) {
  useEffect(() => setupGlobalErrorCapture(), []);
  return <>{children}</>;
}
