# Medical P2 Next Local Closure Audit Report

生成时间：2026-06-09 20:05:39 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台。产品主线覆盖文件上传、OCR/LLM 编排、Schema 管理、字段证据、人工反馈、Evaluation、LIMS 写回、Provider 运维、安全审计和部署 readiness。

本轮审计聚焦 P1/P2 本地产品化闭环：生产多实例 session invalidation store 的 adapter skeleton、诊断和本地验收脚本。审计边界明确：本地 contract 通过不等于真实生产多实例通过，也不等于医疗最终产品完成。

## 2. 功能完整性

本轮已补齐：

- database session invalidation repository adapter skeleton。
- Redis session invalidation repository adapter skeleton。
- adapter diagnostics：provider、storage、redaction、capabilities、readiness。
- production factory 可通过注入 database delegate 或 Redis client 创建 repository-backed store。
- `readiness:session-invalidation` 本地验收脚本。
- production smoke/session store requiredChecks 增加 `raw-token-not-persisted-check`。
- handoff 文档补充 database/Redis skeleton 与真实双实例 smoke 边界。

仍未补齐：

- 未新增 Prisma model/migration，database adapter 当前是 delegate skeleton。
- 未接真实 Redis SDK/client 或真实 Redis 服务。
- 未跑至少 2 个 API 实例共享 store 的 logout/login rotation smoke。
- 未解除真实 OCR/LLM/LIMS、真实 KMS/Vault/Secret Manager、真实 broker blocked。

## 3. 业务流程完整性

本轮本地 session invalidation 流程：

- raw JWT/cookie token 进入 store 前先 SHA-256 hash。
- database adapter 只 upsert `tokenHash`、`invalidatedAt`、`expiresAt`。
- Redis adapter 只写 `keyPrefix + tokenHash` 和 value `tokenHash`，使用 `PX` TTL。
- repository-backed auth store 查询未过期 hash 来判断 session 是否失效。
- `readiness:session-invalidation` 可在无外部凭据环境下验证 database/Redis skeleton 不持久化 raw token，并保留 production smoke blocked 姿态。

生产多实例目标流程仍 blocked：

- 实例 A 登录，实例 B 可通过 cookie 鉴权。
- 实例 A 登出或登录轮换旧 session 后，实例 B 对旧 cookie 必须返回 401。
- store 中只能存在 token hash 和 TTL，不得存在原始 JWT/cookie header。
- 该流程必须在真实共享数据库/Redis 和至少两个 API 实例上完成，本轮未声明通过。

## 4. 用户体验

本轮未修改 UI 设计系统和页面 CSS。Material + Arco Design 当前阶段继续由 style/mobile/build/browser E2E 守护：

- Primary `#3370FF`、背景 `#F7F8FA`、白色侧栏、active nav pill 继续保留。
- 桌面/移动关键路由浏览器 E2E 在 deployment readiness 中通过。
- 9901 首页和 `/api/health` 可访问。

用户侧直接收益主要在部署和运维诊断：部署方可以先运行 `corepack pnpm readiness:session-invalidation`，确认本地 adapter contract 和脱敏边界，再接真实共享 store 做双实例 smoke，减少把单实例/logout 本地通过误判为生产通过的风险。

## 5. 技术实现

关键文件：

- `apps/api/src/auth/session-invalidation.repository.ts`
  - `createDatabaseSessionInvalidationRepository()`。
  - `createRedisSessionInvalidationRepository()`。
  - `SessionInvalidationRepositoryDescription` 明确 `productionReady=false` 和脱敏能力。

- `apps/api/src/bootstrap/production-services.ts`
  - `CreateProductionSessionInvalidationStoreOptions` 支持 `databaseDelegate` 和 `redisClient`。
  - `createProductionSessionInvalidationStore()` 根据 provider 选择 repository、database delegate 或 Redis client。
  - `SESSION_INVALIDATION_REDIS_KEY_PREFIX` 可配置 Redis key prefix。

- `scripts/session-invalidation-readiness.ts`
  - 输出 `localReadiness`、`externalIntegration`、`finalProduct` 三层状态。
  - exit code 2 表示本地 contract passed 但真实外部 blocked。

- `scripts/production-smoke.ts`
  - session invalidation blocked requiredChecks 纳入 `raw-token-not-persisted-check`。

技术边界：

- database adapter 是 delegate skeleton，不代表数据库 schema 已迁移。
- Redis adapter 是 client contract，不代表真实 Redis 已连接。
- `productionReady=false` 是刻意保留，直到真实双实例 smoke 通过。

## 6. P0/P1/P2 问题清单

P0：

- 未发现阻断 typecheck、全量测试、demo-web build、demo-web smoke、9901 本地访问的 P0。

P1 已闭环：

- session invalidation store 从泛 repository contract 推进到 database/Redis adapter skeleton。
- adapter 和本地 readiness 明确 raw token 不持久化，requiredChecks 覆盖双实例 smoke、hash/TTL、raw-token-not-persisted。
- production factory 可注入 adapter skeleton，但仍不伪造真实生产 ready。

P1 remaining/blocked：

- 生产多实例 session invalidation store 未接真实共享数据库/Redis 与双实例 smoke。
- 真实 KMS/Vault/Secret Manager 未接入。
- 真实 OCR/LLM/LIMS sandbox 未通过。

P2 已闭环：

- 新增 `readiness:session-invalidation` 作为本地交接验收脚本。
- production smoke/readiness blocked 诊断更具体，部署方能看到 `raw-token-not-persisted-check`。
- handoff 文档补齐 adapter skeleton 和真实验收边界。

P2 remaining/blocked：

- 真实 broker 多实例可靠队列：lease、retry、dead-letter、heartbeat、status-result consistency 未在真实 Redis/RabbitMQ/SQS 上通过。
- 真实生产 smoke 仍因缺外部 sandbox 和真实依赖而 blocked。

## 7. 验收结论

验证命令：

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：通过，72 passed、1 skipped；413 passed、1 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，19 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，入口 bundle `index-RRIirKAv.js`，`vendor-arco-_4u-J6Qa.js` 415.91 kB。
- `corepack pnpm readiness:session-invalidation`：exit code 2，`localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`。
- `corepack pnpm readiness:deployment`：exit code 2，`localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`。
- 9901 `/`：200 OK。
- 9901 `/api/health`：200 OK。
- dist 与 9901 首页均引用 `/assets/index-RRIirKAv.js`。

分层结论：

- UI 当前阶段：通过。
- 本轮 P1/P2 本地产品化闭环：通过。
- 真实外部集成：blocked。
- 医疗最终产品：不通过/blocked。只有真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session store、真实 broker 多实例可靠队列全部通过后，才能写医疗最终产品通过。
