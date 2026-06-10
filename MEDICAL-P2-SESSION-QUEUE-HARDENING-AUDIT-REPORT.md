# Medical P2 Session Queue Hardening Audit Report

生成时间：2026-06-09 10:56:51 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台。产品主线覆盖文件上传、OCR/LLM 编排、Schema 管理、字段证据、人工反馈、Evaluation、LIMS 写回、Provider 运维、安全审计和部署 smoke。

本轮审计聚焦 P1/P2 session/queue hardening，不把 UI 当前阶段通过、本地 mock smoke 或 contract 测试误判为医疗最终产品完成。

## 2. 功能完整性

本轮已补齐：

- session invalidation store contract。
- in-memory store 的 token hash、TTL 和非生产多实例 posture。
- repository-backed store contract，可接数据库/Redis repository，只保存 token hash、失效时间和过期时间。
- `/status` 脱敏返回 `sessionInvalidationStore` posture。
- production smoke 在 session store 非生产就绪时输出 blocked step。
- queue broker blocked 文案补充 `lease/retry/dead-letter/heartbeat/status consistency`。
- handoff 文档补齐生产多实例 session invalidation store 与真实 broker smoke 验收条件。

未补齐：

- 未新增 Prisma model 或真实数据库 migration。
- 未接真实 Redis/RabbitMQ/SQS broker。
- 未接真实 KMS/Vault/Secret Manager。
- 未执行真实 OCR/LLM/LIMS sandbox smoke。

## 3. 业务流程完整性

本轮本地会话流程：

- 登录后继续下发 HttpOnly `mra_session` cookie。
- 登录带旧 cookie 时旧 session 通过 store 失效。
- 登出时清 cookie，并通过 store 失效当前 token。
- 后续 cookie 鉴权会先检查 session invalidation store。
- store 只保存 SHA-256 token hash，不保存原始 JWT。

生产多实例目标流程仍 blocked：

- API 实例 A 登录，实例 B 可鉴权。
- 实例 A 登出或轮换旧 session 后，实例 B 对旧 cookie 必须返回 401。
- 该流程必须依赖真实共享 store 和多实例 smoke，本轮只完成可测试 contract。

队列业务流程：

- 本地 in-process queue 和 Redis adapter skeleton 已有 lease/retry/dead-letter/heartbeat contract。
- 本轮将 status consistency 纳入 production smoke/handoff blocked 条件。
- 真正多 worker、多实例状态一致性仍需真实 broker smoke。

## 4. 用户体验

UI 当前阶段保持 Material + Arco Design：

- 本轮未修改 `apps/demo-web/src/styles.css`。
- Primary `#3370FF`、背景 `#F7F8FA`、白色侧栏、active nav pill、字体和移动端 guard 继续通过。
- 9901 首页和 `/api/health` 可访问，dist bundle 引用有效。

用户侧收益主要在安全和运维诊断：生产部署方可以从 `/status` 和 `readiness:deployment` 看到 session invalidation store 是否仍是进程内集合，避免登出失效在多实例环境中被误判为已完成。

## 5. 技术实现

关键实现：

- `apps/api/src/auth/auth.service.ts`
  - `SessionInvalidationStore`、`SessionInvalidationRepository`。
  - `createInMemorySessionInvalidationStore()`。
  - `createRepositorySessionInvalidationStore()`。
  - `hashSessionToken()`。

- `apps/api/src/bootstrap/production-services.ts`
  - `buildProductionSessionInvalidationStoreContract()`。
  - `createProductionSessionInvalidationStore()`。
  - 生产装配支持注入 repository-backed store。

- `apps/api/src/server.ts`
  - `/status` 合并 `sessionInvalidationStore` posture。

- `scripts/production-smoke.ts`
  - 真实 production smoke 识别 session store blocked。
  - queue blocked detail 包含 status consistency。

- `docs/2026-06-09-p2-production-handoff.md`
  - 增加生产多实例会话失效与真实 broker 多实例队列验收边界。

技术边界：

- repository-backed store 是接口级 contract，不等于真实数据库/Redis 已接入。
- `productionReady=false` 保持诚实，直到真实共享 store 和多实例 smoke 通过。
- queue adapter skeleton 仍不代表真实 broker 生产可靠性。

## 6. P0/P1/P2 问题清单

P0：

- 未发现阻断 typecheck、全量测试、demo-web build、demo-web smoke 或 9901 本地访问的 P0。

P1 已闭环：

- session invalidation 从进程内集合抽象为 store contract。
- store 持久化边界只使用 token hash 和 TTL。
- `/status`、production smoke、readiness gate 均可诊断 session store 非生产就绪。

P1 remaining/blocked：

- 生产多实例 session invalidation store 尚未接真实数据库/Redis repository 与多实例 smoke。
- 真实 OCR/LLM/LIMS sandbox 未通过。
- 真实 KMS/Vault/Secret Manager 未接入。

P2 已闭环：

- production queue blocked 文案补齐 status consistency。
- handoff 文档补齐 session store 与 broker 多实例验收条件。
- mock-production contract smoke 继续通过。

P2 remaining/blocked：

- 真实 broker 多实例可靠队列：lease、retry、dead-letter、heartbeat、status/result consistency 未在真实 Redis/RabbitMQ/SQS 上通过。
- browser E2E 在一次 readiness 重跑中出现非 required Chrome/CDP 路由就绪波动；单独复跑已通过，建议 CI 保留重试或环境隔离。

## 7. 验收结论

验证命令：

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：通过，67 passed、1 skipped；364 passed、1 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，15 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、10 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，无 500 kB JS warning。
- `corepack pnpm smoke:demo-web`：通过，`mode=mock-runtime`。
- `corepack pnpm readiness:deployment`：exit code 2，required local gates passed，`localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`。
- 9901 `/`：200 OK。
- 9901 `/api/health`：200 OK。
- dist 与 9901 HTML 均引用 `/assets/index-BkZEagFb.js`。

分层结论：

- UI 当前阶段：通过。
- P1/P2 本轮阶段：通过，session/queue hardening 本地 contract 闭环。
- 真实外部集成：blocked。
- 医疗最终产品：不通过/blocked。真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session invalidation store、真实 broker 多实例可靠队列全部通过前，不能改写为最终完成。
