// AI [2026-07-13]: 配置小程序页面路由、窗口与位置权限
export default defineAppConfig({
  pages: [
    "pages/index/index",
    "pages/route-detail/index",
    "pages/articles/index",
    "pages/article-detail/index",
    "pages/profile/index",
  ],
  window: {
    backgroundTextStyle: "dark",
    navigationBarBackgroundColor: "#ffffff",
    navigationBarTitleText: "路书",
    navigationBarTextStyle: "black",
  },
  permission: { "scope.userLocation": { desc: "用于展示附近徒步路线" } },
  requiredPrivateInfos: ["getLocation"],
});
