// AI [2026-07-13]: 执行微信登录并维护本地令牌状态
import Taro from "@tarojs/taro";
import { http } from "./http";
export async function wxLogin() {
  const { code } = await Taro.login();
  const res = await http.post<{ access_token: string; refresh_token: string }>(
    "/auth/wx-login",
    { code },
  );
  Taro.setStorageSync("access_token", res.access_token);
  Taro.setStorageSync("refresh_token", res.refresh_token);
}
export const isLoggedIn = () => !!Taro.getStorageSync("access_token");
export function logout() {
  const token = Taro.getStorageSync("refresh_token");
  if (token)
    http.post("/auth/logout", { refresh_token: token }).catch(() => undefined);
  Taro.removeStorageSync("access_token");
  Taro.removeStorageSync("refresh_token");
}
