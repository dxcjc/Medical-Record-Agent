import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 统一测试配置先保持轻量，后续任务可以在各包内逐步补充真实测试用例。
export default defineConfig({
  resolve: {
    alias: {
      // Vitest 直接读取 workspace 源码，避免测试被旧 dist 产物误导。
      "@medical-record-agent/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@medical-record-agent/shared": fileURLToPath(new URL("./packages/shared/src/index.ts", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "scripts/**/*.test.ts"],
    passWithNoTests: true
  }
});
