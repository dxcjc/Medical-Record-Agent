在 /tmp/Medical-Record-Agent 项目中实现 Phase 1 后端任务。

## 步骤（按顺序执行，不要跳过）

### 步骤 1: 修改 Prisma Schema
在 prisma/schema.prisma 的 RecognitionJob 模型中新增：
```
deletedAt    DateTime?
```

### 步骤 2: 生成 Prisma Client
运行：npx prisma generate

### 步骤 3: 创建推送 API 路由
创建 apps/api/src/routes/v1.routes.ts，实现：
- GET /api/v1/jobs — 任务列表，支持 page/pageSize/status/schemaKey/search 查询参数，返回 { items, total, page, pageSize }，join SchemaVersion 拿 displayName
- GET /api/v1/jobs/:id/result — 标准化结果
- GET /api/v1/jobs/:id/result/fields — 精简版只返回 { fields: { key: value } }

参考 apps/api/src/routes/results.routes.ts 的写法模式。

### 步骤 4: 任务 CRUD 端点
在 apps/api/src/routes/jobs.routes.ts 中新增：
- DELETE /api/jobs/:id — 软删除（设置 deletedAt）
- POST /api/jobs/:id/rerun — 用原任务的 sourceFileId + schemaKey 创建新任务

修改 jobs.repository.ts 的 list 方法，过滤 deletedAt 不为 null 的记录。

### 步骤 5: 注册路由
在 apps/api/src/server.ts 中注册 v1 routes。

### 步骤 6: 验证
运行 pnpm typecheck 确认类型正确。

### 步骤 7: 写审计报告
将结果写入 /tmp/Medical-Record-Agent/PHASE1-AUDIT.md，包含修改文件列表和新增端点列表。
