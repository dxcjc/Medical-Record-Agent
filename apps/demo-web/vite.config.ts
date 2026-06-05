import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages 的项目站点会挂载在 /Medical-Record-Agent/ 子路径下。
// 本地开发仍然使用根路径，避免影响 http://localhost:5173/ 的访问方式。
const base = process.env.GITHUB_PAGES === "true" ? "/Medical-Record-Agent/" : "/";

// 前端应用配置 React 插件和部署 base；base 会同时影响静态资源路径和 import.meta.env.BASE_URL。
export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173
  }
});
