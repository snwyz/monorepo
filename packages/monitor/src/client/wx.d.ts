// AI [2026-07-13]: 声明小程序实时日志所需的微信全局类型
interface WxRealtimeLogManager {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  setFilterMsg(msg: string): void;
}

declare const wx: {
  getRealtimeLogManager(): WxRealtimeLogManager;
  onError(callback: (error: unknown) => void): void;
};
