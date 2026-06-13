# Phase 1 后端审计报告

> 生成日期：2026-06-14

---

## 1. 类型错误修复

运行 `pnpm typecheck` 发现 6 个类型错误，全部已修复：

| # | 文件 | 错误 | 修复方式 |
|---|------|------|----------|
| 1 | `apps/api/src/routes/base.routes.test.ts:297` | `JobRouteService` mock 缺少 `softDelete`, `rerun` | 补充 mock 方法 |
| 2 | `apps/api/src/routes/base.routes.test.ts:334` | 同上 | 同上 |
| 3 | `apps/api/src/routes/base.routes.test.ts:389` | 同上 | 同上 |
| 4 | `apps/api/src/routes/base.routes.test.ts:530` | `FeedbackRouteService` mock 缺少 `listByJobId` | 补充 mock 方法 |
| 5 | `apps/api/src/routes/base.routes.test.ts:615` | 同上 | 同上 |
| 6 | `apps/api/src/routes/route-service-contracts.test.ts:60` | `listPaginated` 不存在于 `JobRouteService` | 移除该行（接口未定义此方法） |

---

## 2. 修改的文件列表（共 23 个已修改 + 9 个新增）

### 已修改的文件

| 文件 | 改动说明 |
|------|----------|
| `prisma/schema.prisma` | 数据库 schema 变更 |
| `pnpm-lock.yaml` | 依赖锁文件更新 |
| `apps/api/package.json` | API 包依赖更新 |
| `apps/api/src/server.ts` | 新增 knowledge / v1 路由注册 |
| `apps/api/src/server.test.ts` | 服务端测试更新 |
| `apps/api/src/bootstrap/production-services.ts` | 生产环境服务初始化 |
| `apps/api/src/repositories/jobs.repository.ts` | 任务仓库新增 softDelete/rerun/listPaginated |
| `apps/api/src/routes/jobs.routes.ts` | 新增 DELETE /jobs/:id 和 POST /jobs/:id/rerun |
| `apps/api/src/routes/feedback.routes.ts` | 新增 GET /feedback (listByJobId) |
| `apps/api/src/routes/route-dtos.ts` | DTO 定义更新 |
| `apps/api/src/routes/base.routes.test.ts` | 路由集成测试更新 |
| `apps/api/src/routes/route-service-contracts.test.ts` | 编译期契约测试更新 |
| `apps/api/src/services/api-services.ts` | 服务层新增方法 |
| `apps/api/src/services/api-services.test.ts` | 服务层测试更新 |
| `packages/core/src/engine/langgraphRecognitionWorkflow.ts` | 识别引擎工作流改动 |
| `packages/core/src/rag/knowledgeBase.ts` | 知识库 RAG 改动 |
| `medical-ui/src/api/client.ts` | 前端 API client 更新 |
| `medical-ui/src/components/ConfidenceDashboard.tsx` | 置信度仪表盘组件 |
| `medical-ui/src/components/FieldGroup.tsx` | 字段分组组件 |
| `medical-ui/src/icons/appIcons.tsx` | 应用图标 |
| `medical-ui/src/pages/JobDetailPage.tsx` | 任务详情页 |
| `medical-ui/src/pages/JobListPage.tsx` | 任务列表页 |
| `medical-ui/src/pages/NewRecognitionPage.tsx` | 新建识别页 |

### 新增的文件

| 文件 | 说明 |
|------|------|
| `apps/api/src/routes/v1.routes.ts` | v1 版本化 API 路由 |
| `apps/api/src/routes/knowledge.routes.ts` | 知识库 CRUD 路由 |
| `apps/api/src/repositories/knowledge.repository.ts` | 知识库数据仓库 |
| `apps/api/src/repositories/webhook.repository.ts` | Webhook 数据仓库 |
| `apps/api/src/services/database-knowledge-retriever.ts` | 数据库知识检索器 |
| `medical-ui/src/components/PipelineProgress.tsx` | 流水线进度组件 |
| `prisma/seed-knowledge.ts` | 知识库种子数据 |
| `apps/cli/` | CLI 工具（目录） |

---

## 3. 新增 API 端点（共 11 个）

### Job 路由扩展

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| `DELETE` | `/jobs/:id` | `job:create` | 软删除任务 |
| `POST` | `/jobs/:id/rerun` | `job:create` | 重新运行任务 |

### Feedback 路由扩展

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| `GET` | `/feedback?jobId=xxx` | `feedback:create` | 按 jobId 查询反馈列表 |

### v1 版本化 API（新文件）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| `GET` | `/api/v1/jobs` | `job:read` | 分页查询任务（支持 page/pageSize/status/schemaKey/search） |
| `GET` | `/api/v1/jobs/:id/result` | `job:read` | 获取任务识别结果 |
| `GET` | `/api/v1/jobs/:id/result/fields` | `job:read` | 仅获取提取字段 |

### Knowledge 知识库 API（新文件）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| `GET` | `/knowledge` | **无鉴权** | 查询知识条目（支持 kind/enabled/fieldKey/search） |
| `GET` | `/knowledge/:id` | **无鉴权** | 获取单条知识 |
| `POST` | `/knowledge` | **无鉴权** | 创建知识条目 |
| `PUT` | `/knowledge/:id` | **无鉴权** | 更新知识条目 |
| `DELETE` | `/knowledge/:id` | **无鉴权** | 删除知识条目 |

---

## 4. 构建验证结果

| 验证项 | 结果 |
|--------|------|
| `pnpm typecheck` | ✅ 通过（packages/shared, packages/core, apps/api 全部通过） |
| `medical-ui pnpm build` | ✅ 通过（Vite 构建成功，输出 998.96 kB JS + 582.39 kB CSS） |

> **注意**：前端构建有 chunk size warning（JS 超过 500 kB），建议后续使用 dynamic import 做代码分割。

---

## 5. 遗留问题

### 🔴 安全问题

1. **Knowledge 路由无鉴权**：`knowledge.routes.ts` 中 5 个端点均未接入 `authHooks`，参数 `authHook` 被接受但未使用。任何请求均可直接增删改查知识库数据。
2. **Feedback GET 使用 create 权限**：`GET /feedback` 复用 `feedback:create` 权限而非独立的读权限，违反最小权限原则。

### 🟡 设计待定

3. **Job 删除/重跑权限**：`DELETE /jobs/:id` 和 `POST /jobs/:id/rerun` 均使用 `job:create` 权限，未定义 `job:delete` / `job:rerun` 独立权限。
4. **`listPaginated` 接口缺失**：`route-service-contracts.test.ts` 中曾引用 `listPaginated` 方法，但 `JobRouteService` 接口中并未定义。测试中已移除此引用，但实际分页功能通过 v1 路由单独实现。
5. **前端 chunk 过大**：JS bundle 接近 1 MB，建议拆分。
