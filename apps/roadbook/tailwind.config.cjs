/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  corePlugins: {
    // 小程序不需要浏览器默认样式重置。
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
};
