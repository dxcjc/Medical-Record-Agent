import { defineConfig } from "vitest/config";

// 统一测试配置先保持轻量，后续任务可以在各包内逐步补充真实测试用例。
export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    passWithNoTests: true
  }
});
