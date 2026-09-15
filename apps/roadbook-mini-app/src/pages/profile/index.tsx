// AI [2026-07-13]: 提供微信登录与退出登录入口
import { Button, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { isLoggedIn, logout, wxLogin } from "../../services/auth";
export default function ProfilePage() {
  const loggedIn = isLoggedIn();
  const login = async () => {
    try {
      await wxLogin();
      Taro.showToast({ title: "登录成功", icon: "success" });
    } catch {
      Taro.showToast({ title: "登录失败", icon: "none" });
    }
  };
  return (
    <View className="min-h-screen bg-slate-50 p-4">
      <Text className="mb-6 block text-2xl font-bold text-slate-900">我的</Text>
      {loggedIn ? (
        <Button
          className="rounded-lg"
          onClick={() => {
            logout();
            Taro.showToast({ title: "已退出", icon: "none" });
          }}
        >
          退出登录
        </Button>
      ) : (
        <Button className="rounded-lg" type="primary" onClick={login}>
          微信一键登录
        </Button>
      )}
    </View>
  );
}
