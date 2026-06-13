继续修复 /tmp/Medical-Record-Agent 的 Phase 1 后端任务。

当前状态：已实现推送 API、任务 CRUD、Prisma 改动，但 pnpm typecheck 有类型错误。

## 你的任务

运行 `cd /tmp/Medical-Record-Agent && pnpm typecheck 2>&1` 查看所有类型错误，逐个修复，直到 typecheck 通过。

常见问题：
1. 测试文件 mock 缺少新增的方法（softDelete, rerun, listPaginated, listByJobId）
2. v1.routes.ts 的 exactOptionalPropertyTypes 问题
3. api-services.ts 中 feedbackRepository 类型缺少 listByJobId

修复完 typecheck 后：
1. 运行 `cd /tmp/Medical-Record-Agent/medical-ui && pnpm build` 验证前端构建
2. 将审计报告写入 /tmp/Medical-Record-Agent/PHASE1-AUDIT.md，包含：
   - 修改的文件列表
   - 新增的 API 端点
   - 构建验证结果
   - 遗留问题

【重要】不要问问题，直接修复。
