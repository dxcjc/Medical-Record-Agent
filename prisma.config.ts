import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    // Prisma 6.19 已支持在 prisma.config.ts 中配置 seed 命令，避免继续依赖即将废弃的 package.json#prisma。
    seed: "tsx prisma/seed.ts"
  }
});
