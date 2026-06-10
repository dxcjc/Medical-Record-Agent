# Medical P2 Deployment Readiness Audit Report

生成时间：2026-06-09 09:12:41 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台。产品主线覆盖上传、OCR/LLM 编排、Schema 管理、字段证据、人工反馈、Evaluation、LIMS 写回、Provider 运维、安全审计和生产 smoke。

本轮审计聚焦 deployment readiness：把 UI、本地 P1/P2 readiness、mock-production contract、真实外部 integration、医疗最终产品分层，避免把 UI 当前阶段通过或 mock smoke 误判为最终产品通过。

## 2. 功能完整性

已补齐：

- `corepack pnpm readiness:deployment` 聚合 gate，可执行并输出 JSON/文本摘要。
- `scripts/production-smoke.ts` 可在真实 sandbox `/status` 中识别脱敏 secret resolver 与 queue posture，非生产状态标记 blocked。
- `/status` 生产 runtime 可返回脱敏 `secretResolver` contract，供部署方和 smoke 判断真实 KMS/Vault/Secret Manager 是否接入。
- Handoff 文档明确 exit code、验收命令和 blocked/fail/passed 判定。

未补齐：

- 真实 OCR/LLM/LIMS sandbox 接入。
- 真实 KMS/Vault/Secret Manager SDK/client/凭据。
- 真实 Redis/RabbitMQ/SQS broker、worker 多实例可靠性 smoke。

## 3. 业务流程完整性

本地 readiness 流程已闭环：

- typecheck、全量测试、demo-web style/mobile/build/smoke、browser E2E、mock-production writeback contract smoke 均通过。
- readiness gate 汇总后给出 `localReadiness=passed`。

真实生产业务流程仍 blocked：

- `corepack pnpm smoke:production` 当前输出 `MODE blocked`、`STATUS blocked`。
- 缺真实 sandbox 登录和外部 OCR/LLM/LIMS 条件。
- `SECRET_RESOLVER_ENV_ONLY` 表示当前 env resolver 不能代表真实密钥库。
- `QUEUE_BROKER_NOT_CONFIGURED` 表示当前未完成真实 broker 多实例 smoke。

## 4. 用户体验

UI 当前阶段保持通过：

- Primary `#3370FF`、背景 `#F7F8FA`、白色侧栏、active nav pill。
- `DM Sans + Noto Sans SC` 字体。
- 移动端抽屉、单列布局和 44px 触摸区继续由 guard 覆盖。
- 本轮未重写 CSS，未改变 Material + Arco Design 视觉体系。

本轮用户侧收益主要在部署和运维体验：部署方可以通过 readiness gate 一次性看到本地 readiness、真实 integration blocked 和最终产品 blocked 的分层结论。

## 5. 技术实现

关键文件：

- `scripts/deployment-readiness-gate.ts`
  - 新增部署 readiness 聚合脚本。
  - 顺序执行 9 个 gate，输出 `localReadiness`、`externalIntegration`、`finalProduct`。
  - exit code 2 表示 blocked 而非 failed。

- `scripts/production-smoke.ts`
  - preflight blocked 文案补充部署 code。
  - `/status` dependency posture 中 `secretResolver.productionReady=false` 或 `queue.productionReady=false` 会进入 blocked steps。

- `apps/api/src/index.ts`
  - 生产 runtime info 增加 `buildSecretResolverContract(process.env)`。

- `apps/api/src/server.ts`
  - `ApiRuntimeInfo` 支持脱敏 `secretResolver`。

- `docs/2026-06-09-p2-production-handoff.md`
  - 增加 readiness gate、exit code 和最终验收边界。

## 6. P0/P1/P2 问题清单

P0：

- 未发现当前阻断 typecheck、全量测试、demo-web build、demo-web smoke、browser E2E 的 P0。

P1 已闭环：

- 部署 readiness gate 可执行并输出清晰 JSON/文本摘要。
- 真实 production smoke 缺外部条件时保持 blocked，不伪造 passed。
- `/status` 可以提供脱敏 secret resolver posture，便于真实环境快速定位密钥库接入缺口。

P1 remaining/blocked：

- 真实 OCR/LLM/LIMS sandbox。
- 真实 KMS/Vault/Secret Manager。
- 真实 production smoke `STATUS passed`。

P2 已闭环：

- readiness gate 测试覆盖命令矩阵、blocked/fail/passed 判定。
- handoff 文档测试覆盖 exit code 与最终产品 blocked 口径。
- mock-production writeback contract smoke 可通过，且报告中明确不代表真实生产通过。

P2 remaining/blocked：

- 真实 Redis/RabbitMQ/SQS broker。
- 多实例 worker 绑定、租约续期、失败重试、DLQ、heartbeat 超时恢复和状态一致性 smoke。
- 真实 broker 积压和失败监控。

## 7. 验收结论

验证命令：

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：通过，66 passed、1 skipped；351 passed、1 skipped。仍有既有 Node `DEP0040 punycode` deprecation warning。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，15 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、10 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，无 500 kB JS chunk warning。
- `corepack pnpm smoke:demo-web`：通过，`mode=mock-runtime`。
- `corepack pnpm e2e:demo-web:browser`：通过，`browserE2E=passed`、`engine=chrome-cdp`。
- `corepack pnpm smoke:production`：blocked，exit code 2，缺真实 sandbox、真实密钥库和真实 broker。
- `PRODUCTION_SMOKE_MODE=mock-production PRODUCTION_SMOKE_RUN_WRITEBACK=1 corepack pnpm smoke:production`：通过，仅代表本地 contract smoke。
- `corepack pnpm readiness:deployment`：blocked，exit code 2，`localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`。

分层结论：

- UI 当前阶段：通过。
- P1/P2 deployment readiness 阶段：通过。
- 真实外部集成：blocked。
- 医疗最终产品：不通过。必须在真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、真实 broker 多实例可靠队列和真实 production smoke 全部通过后，才可改写为通过。
