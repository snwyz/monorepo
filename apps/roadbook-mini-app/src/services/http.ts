// AI [2026-07-13]: 封装带登录令牌与错误日志的小程序 API 请求
import Taro from "@tarojs/taro";
const baseUrl =
  process.env.TARO_APP_API_BASE_URL ?? "http://localhost:3000/api/v1";
export async function request<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  data?: Record<string, unknown>,
): Promise<T> {
  const token = Taro.getStorageSync("access_token");
  const res = await Taro.request({
    url: `${baseUrl}${path}`,
    method,
    data,
    header: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.statusCode >= 400) {
    console.error("[http]", method, path, res.statusCode, res.data);
    throw new Error(
      (res.data as { message?: string })?.message ?? "Request failed",
    );
  }
  return res.data as T;
}
export const http = {
  get: <T>(path: string, params?: Record<string, unknown>) =>
    request<T>("GET", path, params),
  post: <T>(path: string, data?: Record<string, unknown>) =>
    request<T>("POST", path, data),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
