# Medical P2 Adapter Hardening Audit Report

生成时间：2026-06-09 08:06:00 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台。产品主线覆盖上传、OCR/LLM 编排、Schema、字段证据、人工复核、Evaluation、LIMS 写回、Provider 运维、审计和生产 smoke。

本轮审计聚焦 adapter hardening：可靠队列、密钥库和 production smoke 的生产化边界。UI 当前阶段已通过并保持 Material + Arco Design，但 UI 通过不等同于医疗项目最终产品完成。

## 2. 功能完整性

已补齐：

- Redis broker adapter skeleton：`createRedisJobQueueAdapter()` 支持 mockable `RedisJobQueueClient`，覆盖 enqueue、lease、retry、dead-letter、heartbeat、idempotency key。
- Production queue factory：`createProductionJobQueueAdapter()` 可在完整 broker 配置和注入 Redis client 时装配 Redis adapter skeleton。
- Secret resolver skeleton：`createVaultSecretResolver()`、`createKmsSecretResolver()`、`createSecretManagerResolver()` 支持注入 client 后解析 secret；无 client 时返回 blocked。
- Production smoke：缺真实外部条件时继续输出 `STATUS blocked`，并区分 sandbox、secret resolver、queue broker blocked 原因。
- Handoff 文档：明确部署方需要提供 broker/KMS/sandbox 条件、验收命令和 blocked 判断。

未完整：

- 未接真实 Redis/RabbitMQ/SQS SDK 和 broker 服务。
- 未接真实 Vault/KMS/Secret Manager SDK 和凭据。
- 未执行真实 OCR/LLM/LIMS sandbox smoke。

## 3. 业务流程完整性

本地工程化闭环：

- mock-production smoke 可跑通 status、login、providers、provider health、file upload、job poll、result read、writeback。
- Redis adapter skeleton 的 contract test 覆盖可靠队列关键语义，但没有真实 worker 绑定 domain task 执行。
- Secret resolver skeleton 的 contract test 覆盖 Vault/KMS/Secret Manager mock client 成功解析和无 client blocked。

真实生产闭环：

- `PRODUCTION_SMOKE_MODE=real-sandbox` 仍需要部署方提供真实 base URL、账号、密码、provider keys、LIMS sandbox 和脱敏样本。
- `QUEUE_MODE=broker` + `QUEUE_BROKER_PROVIDER=redis` + 完整配置 + Redis client 只代表 adapter skeleton 可装配；真实 broker/worker 多实例 smoke 前仍是 `QUEUE_BROKER_SMOKE_NOT_RUN`。
- `SECRET_RESOLVER_PROVIDER=vault/kms/secret-manager` 只有注入真实 client/SDK 后才可能读取外部密钥；否则仍是 `SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED`。

## 4. 用户体验

UI 当前阶段保持通过：

- Primary `#3370FF`、背景 `#F7F8FA`、白色侧栏、active nav pill。
- `DM Sans + Noto Sans SC` 字体。
- 移动端抽屉、单列布局和 44px 触摸区继续由 guard 覆盖。
- 本轮未粗暴重写 CSS，未改变前端页面视觉体系。

用户侧主要收益在运维和交付语义：production smoke、provider health 和 handoff 文档不再把 mock 或缺外部条件误判为真实通过。

## 5. 技术实现

关键实现文件：

- `apps/api/src/services/api-services.ts`
  - `RedisJobQueueClient`、`RedisJobQueueAdapter`、`createRedisJobQueueAdapter()`。
  - Redis skeleton 的 `describe()` 明确 `productionReady=false`、`QUEUE_BROKER_SMOKE_NOT_RUN`。

- `apps/api/src/bootstrap/production-services.ts`
  - `VaultSecretResolverClient`、`KmsSecretResolverClient`、`SecretManagerResolverClient`。
  - `createVaultSecretResolver()`、`createKmsSecretResolver()`、`createSecretManagerResolver()`。
  - `QUEUE_BROKER_PROVIDER` contract 和 `createProductionJobQueueAdapter()`。
  - `createProductionApiServices()` 支持注入 `redisQueueClient`/`queueEnv`。

- `scripts/production-smoke.ts`
  - 默认 real-sandbox 缺配置时输出 `MODE blocked`、`STATUS blocked`。
  - queue broker blocked detail 明确 Redis skeleton 和真实 broker/worker smoke 缺口。

- `docs/2026-06-09-p2-production-handoff.md`
  - 补充密钥库 resolver skeleton、Redis adapter skeleton、部署条件和验收边界。

## 6. P0/P1/P2 问题清单

P0：

- 未发现当前阻断 typecheck、全量测试、demo-web build、demo-web smoke 的 P0。

P1 已闭环：

- Production smoke 状态分类保持 `passed|blocked|failed`，缺真实条件时不会伪造通过。
- Secret resolver 从 env/fail-fast contract 推进到 Vault/KMS/Secret Manager provider-specific skeleton。
- Provider secret 解析失败仍只返回 secretRef、resolver source 和 blocked reason，不泄露明文。

P1 remaining/blocked：

- 真实 OCR/LLM/LIMS sandbox smoke：blocked。
- 真实 KMS/Vault/Secret Manager SDK/client/凭据：blocked。

P2 已闭环：

- Redis broker adapter skeleton 和 mockable client contract。
- lease、retry、dead-letter、heartbeat、idempotency key 的单元测试。
- Production queue contract 支持 `QUEUE_BROKER_PROVIDER=redis`，并区分 `QUEUE_BROKER_ADAPTER_NOT_CONNECTED` 和 `QUEUE_BROKER_SMOKE_NOT_RUN`。
- Handoff 文档和 `.env.example` 更新。

P2 remaining/blocked：

- 真实 Redis/RabbitMQ/SQS broker。
- worker 绑定真实 domain task、持久化 lease、超时恢复、积压监控。
- 多实例 status/result 一致性 smoke。

## 7. 验收结论

验证命令：

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：通过，65 passed、1 skipped；345 passed、1 skipped。仍有既有 Node `DEP0040 punycode` deprecation warning。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，15 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、10 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，无 500 kB JS chunk warning。
- `corepack pnpm smoke:demo-web`：通过，`mode=mock-runtime`、`apiHealthOk=true`、`distBundleOk=true`。
- `corepack pnpm smoke:production`：blocked，`MODE blocked`、`STATUS blocked`，缺真实 sandbox 凭据、真实密钥库和真实 broker/worker 多实例 smoke。
- `PRODUCTION_SMOKE_MODE=mock-production PRODUCTION_SMOKE_RUN_WRITEBACK=1 corepack pnpm smoke:production`：通过，`STATUS passed`，仅代表本地 contract smoke。

分层结论：

- UI 当前阶段：通过。
- P1/P2 本轮工程化阶段：通过。
- 真实外部集成：blocked。
- 医疗项目最终产品：不通过。
