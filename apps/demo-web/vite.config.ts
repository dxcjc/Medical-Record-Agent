import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// GitHub Pages 的项目站点会挂载在 /Medical-Record-Agent/ 子路径下。
// 本地开发仍然使用根路径，避免影响 http://localhost:5173/ 的访问方式。
const base = process.env.GITHUB_PAGES === "true" ? "/Medical-Record-Agent/" : "/";
// apps/demo-web/src/vendor/arco-on-demand.ts 只导出当前页面实际使用的 Arco 组件深入口。
const arcoOnDemandEntry = fileURLToPath(new URL("./src/vendor/arco-on-demand.ts", import.meta.url));

// 前端应用配置 React 插件和部署 base；base 会同时影响静态资源路径和 import.meta.env.BASE_URL。
export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@arco-design\/web-react$/,
        replacement: arcoOnDemandEntry
      }
    ]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          const normalizedId = id.replace(/\\/g, "/");

          if (id.includes("@arco-design/web-react") || id.includes("@arco-design/web-react-icon")) {
            // Arco 组件内部共享 _util、Trigger、Form、Table 等模块。
            // 细拆这些模块会让 Rollup 报 circular manual chunk warning，因此保持单一稳定 chunk。
            return "vendor-arco";
          }

          if (
            normalizedId.includes("/node_modules/react/") ||
            normalizedId.includes("/node_modules/react-dom/") ||
            normalizedId.includes("/node_modules/scheduler/")
          ) {
            return "vendor-react";
          }

          if (
            normalizedId.includes("/node_modules/react-router/") ||
            normalizedId.includes("/node_modules/react-router-dom/") ||
            normalizedId.includes("/node_modules/@tanstack/")
          ) {
            return "vendor-app-runtime";
          }

          if (id.includes("lucide-react") || id.includes("driver.js")) {
            return "vendor-interaction";
          }

          return "vendor-core";
        }
      }
    }
  },
  server: {
    port: 5173
  }
});
