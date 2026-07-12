// AI [2026-07-13]: 封装微信小程序实时日志与全局错误上报
type WxLogManager = ReturnType<typeof wx.getRealtimeLogManager>;
let manager: WxLogManager | null = null;
function getManager(): WxLogManager | null {
  if (typeof wx === "undefined") return null;
  return (manager ??= wx.getRealtimeLogManager());
}
export const logger = {
  info: (...args: unknown[]) => getManager()?.info(...args),
  warn: (...args: unknown[]) => getManager()?.warn(...args),
  error: (...args: unknown[]) => getManager()?.error(...args),
  setFilterMsg: (msg: string) => getManager()?.setFilterMsg(msg),
};
export function setupGlobalErrorCapture() {
  if (typeof wx !== "undefined")
    wx.onError((err) => logger.error("[uncaught]", err));
}
