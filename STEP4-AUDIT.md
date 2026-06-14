# STEP4-AUDIT.md — 系统缺陷扫描 + 修复审计报告

**项目**: Medical Record Agent  
**日期**: 2026-06-14  
**扫描范围**: `apps/api/src`, `packages/core/src`, `packages/shared/src`, `medical-ui/src`  
**扫描维度**: 安全性、错误处理、输入校验、性能、边界条件

---

## 验证结果

| 检查项 | 状态 |
|--------|------|
| `pnpm typecheck` | ✅ 通过（shared / core / api 全部通过） |
| `cd medical-ui && pnpm build` | ✅ 通过（2684 模块，7.77s） |
| 后端测试 | ✅ 337 通过 / 11 失败（全部为预存问题，零回归） |

**测试变化**: 修复前 12 个失败 → 修复后 11 个失败（修复了 checksum 校验测试）。  
剩余 11 个失败均为预存问题：`production-services.test.ts`（8 个 WORKFLOW_UNEXPECTED_FAILURE）、`llmExtraction.test.ts`（1 个 schema mismatch）、`docs/` 下 2 个引用已删除 demo-web 的测试。

---

## 修复清单

### P0 — 严重安全漏洞（已修复 2 项）

| # | 问题 | 文件 | 修复方式 |
|---|------|------|----------|
| P0-1 | Knowledge 路由全部无认证——任何人可增删改知识库 | `knowledge.routes.ts`, `server.ts` | 添加 `authHook.authenticate` 到全部 5 个路由，POST/PUT/DELETE 额外添加 `schema:read` 权限检查 |
| P0-2 | Stats 路由无认证 | `stats.routes.ts`, `server.ts` | 添加 `authHook.authenticate`，server.ts 传递 `authHooks` |

### P1 — 高危问题（已修复 7 项）

| # | 问题 | 文件 | 修复方式 |
|---|------|------|----------|
| P1-1 | Session cookie 缺少 `Secure` 标志 | `session-cookie.ts` | `NODE_ENV=production` 时自动添加 `Secure` |
| P1-2 | 文件上传无 MIME 类型白名单 | `route-dtos.ts` | 添加 10 种允许的 MIME 类型（JPEG/PNG/TIFF/BMP/GIF/WebP/PDF/DICOM/txt/JSON），使用 Zod refine 校验 |
| P1-3 | 文件上传无服务端大小限制 | `api-services.ts` | `decodeBase64Content` 添加 50MB 上限检查，超出返回 413 |
| P1-4 | 存储 key 使用 Math.random()（低熵） | `api-services.ts` | 改用 `crypto.randomUUID().slice(0, 8)` |
| P1-5 | 文件名无长度限制 | `api-services.ts` | `toStorageKey` 中 `safeName` 截断至 200 字符 |
| P1-6 | 原始文件名通过 console.log 泄露 PII | `api-services.ts` | 移除 `[STORAGE_KEY]` 和 `[CHECKSUM]` 两处 console.log |
| P1-7 | Jobs 列表 limit 参数无上限 | `jobs.routes.ts` | 添加 `Math.min(Math.max(..., 1), 100)` 限制范围 1-100 |

### P2 — 中等问题（已修复 5 项）

| # | 问题 | 文件 | 修复方式 |
|---|------|------|----------|
| P2-1 | Knowledge 路由 POST body 无 Zod 校验 | `knowledge.routes.ts` | 新增 `knowledgeCreateSchema` 和 `knowledgeUpdateSchema`，含字段长度限制 |
| P2-2 | Knowledge PUT/DELETE catch 吞掉所有错误为 404 | `knowledge.routes.ts` | 检查 Prisma P2025 错误码区分"未找到"和内部错误 |
| P2-3 | localStorage JSON.parse 无 try-catch | `local-storage.provider.ts` | 包裹 try-catch，损坏元数据返回空对象 |
| P2-4 | CORS origins 硬编码 localhost | `server.ts` | 支持 `CORS_ORIGINS` 环境变量（逗号分隔），默认 localhost |
| P2-5 | 前端 useJobs 无条件 10s 轮询 | `useJobs.ts` | 添加 `refetchIntervalInBackground: false`，标签页非活跃时停止轮询 |

### P2 — 中等问题（记录为已知问题，未修复）

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| P2-6 | LLM provider 无重试逻辑 | `httpLlmProvider.ts` | OCR 有重试，LLM 无。需统一重试策略 |
| P2-7 | CORS methods 缺少 DELETE | `server.ts` | 已在修复 P0-2 时一并添加 |
| P2-8 | Evaluation 路由用手动 type guard 替代 Zod | `evaluation.routes.ts` | 建议后续统一迁移到 Zod schema |
| P2-9 | req.query 大部分路由未用 Zod 校验 | 多个路由文件 | 建议后续统一添加 query schema |
| P2-10 | Rate limiter 内存 Map 不支持多实例 | `server.ts` | 生产环境需改用 Redis-backed 方案 |
| P2-11 | Content-Disposition 未完全清理控制字符 | `files.routes.ts` | encodeURIComponent 已覆盖大部分场景 |
| P2-12 | V1 search 参数无长度限制 | `jobs.repository.ts` | 建议添加 maxLength 限制 |

### P1 — 高危问题（记录为已知问题，需架构级改动）

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| P1-8 | 全局错误处理器——35/42 路由无本地 try/catch | 所有路由文件 | Fastify 全局 handler 已捕获异常并返回结构化错误码，风险可控。建议后续按路由模块添加 wrapper |
| P1-9 | Prisma 错误无统一处理（P2002/P2003/P2025） | repository/service 层 | 已在 Knowledge 路由添加 P2025 处理。建议后续添加全局 Prisma 错误翻译中间件 |
| P1-10 | 文件上传后 DB 创建失败无清理 | `api-services.ts` | 需添加 storageProvider.delete 回滚逻辑 |
| P1-11 | Session invalidation 默认内存模式 | `auth.service.ts` | 代码已标记 `productionReady: false`，生产需配置 `SESSION_INVALIDATION_STORE_MODE=repository` |
| P1-12 | 无 CSRF 保护 | 全局 | `SameSite=Lax` 提供部分防护。API 路由需 Bearer token 或 API token，风险主要在 cookie 认证路径 |

---

## P3/P4 — 低优先级问题（已知问题）

### 性能

| # | 问题 | 文件 |
|---|------|------|
| P3-1 | getTrendStats N+1 查询——先查所有 ID 再传入 SQL | `stats.service.ts` |
| P3-2 | getFieldStats 无限制加载所有 RecognitionResult | `stats.service.ts` |
| P3-3 | 文件读取加载整个文件到内存（无流式） | `local-storage.provider.ts` |
| P3-4 | Knowledge retriever 每次 RAG 查询加载全部知识条目 | `database-knowledge-retriever.ts` |
| P3-5 | Job queue 无并发限制 | `api-services.ts` |
| P3-6 | Schema/Evaluation/Webhook repository 列表无分页 | 多个 repository |

### 边界条件

| # | 问题 | 文件 |
|---|------|------|
| P4-1 | Writeback 竞态条件（check-then-act 非原子） | `api-services.ts` |
| P4-2 | Writeback idempotency key 可碰撞 | `api-services.ts` |
| P4-3 | Provider default 设置非原子（clear + upsert） | `provider.repository.ts` |
| P4-4 | 前端时区 UTC/local 不一致 | `stats.service.ts`, `DashboardPage.tsx` |
| P4-5 | 前端 useFieldStats/useTrendStats 非空断言 | `useFieldStats.ts` |

---

## 积极发现（无需修复）

| 项目 | 说明 |
|------|------|
| 路径穿越防护 | `local-storage.provider.ts` 的 `normalizeStorageKey` 完善——null 字节、`..`、绝对路径检查 |
| 安全响应头 | `security.middleware.ts` 设置了 CSP、X-Frame-Options、HSTS 等完整安全头 |
| 错误响应不泄露详情 | 全局错误处理器只返回 error code，不返回 message |
| 敏感值脱敏 | `redactSensitiveRouteValue()` 递归遮蔽 API key、token、password |
| 密钥不落库 | Provider config 的 `findPlaintextSecretConfigPath()` 拒绝明文密钥 |
| Prisma schema 索引覆盖 | 所有主要查询路径均有 @@index 注解 |
| `.env` 未提交到 git | `.gitignore` 正确排除，`git ls-files` 确认未追踪 |
| 空数据集处理 | stats.service 空数组正确短路，metrics 除零保护 |
| 除法零保护 | `evaluation/metrics.ts` 对分母为零做了 guard |

---

## 修改文件清单

| 文件 | 变更类型 |
|------|----------|
| `apps/api/src/routes/knowledge.routes.ts` | 重写——添加认证、Zod 校验、错误区分 |
| `apps/api/src/routes/stats.routes.ts` | 重写——添加认证支持 |
| `apps/api/src/server.ts` | 传递 authHooks 到 knowledge/stats 路由、CORS 可配置、添加 DELETE 方法 |
| `apps/api/src/auth/session-cookie.ts` | 生产环境添加 Secure 标志 |
| `apps/api/src/routes/route-dtos.ts` | MIME 类型白名单、文件名长度限制、byteSize 上限 |
| `apps/api/src/services/api-services.ts` | 文件大小限制、crypto.randomUUID、移除 PII 日志、修复 checksum 逻辑 |
| `apps/api/src/routes/jobs.routes.ts` | limit 参数范围限制 1-100 |
| `apps/api/src/storage/local-storage.provider.ts` | JSON.parse try-catch |
| `medical-ui/src/hooks/useJobs.ts` | refetchIntervalInBackground: false |
| `apps/api/src/services/api-services.test.ts` | 存储 key 断言更新为正则匹配 |
| `apps/api/src/bootstrap/production-services.test.ts` | 存储 key 断言更新为正则匹配 |

---

## 总结

- **P0 问题**: 2 个发现，2 个已修复 ✅
- **P1 问题**: 12 个发现，7 个已修复，5 个记录为已知问题（需架构级改动）
- **P2 问题**: 12 个发现，5 个已修复，7 个记录为已知问题
- **P3/P4 问题**: 11 个发现，全部记录为已知问题
- **零回归**: 所有修复均通过 typecheck + build + 测试验证
