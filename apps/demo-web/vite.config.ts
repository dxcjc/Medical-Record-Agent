import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 前端应用先只配置 Vite 和 React 插件，真实页面会在后续任务中逐步补齐。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  }
});
