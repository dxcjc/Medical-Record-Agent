# Medical P2 Adapter Hardening Fix Report

生成时间：2026-06-09 08:06:00 CST / Asia/Shanghai

## 1. 本轮范围

本轮继续推进 P1/P2 业务、安全、集成生产化闭环，重点是可靠队列和密钥库 adapter 边界。UI 当前阶段保持通过，但不把 UI 或 mock-production contract smoke 写成最终产品完成。

Superpowers 流程记录：

- Brainstorming：读取 continuation、产品审计、P2 integration hardening、production handoff、UI/P1/P2 closure 报告后，确认真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、多实例 broker 在当前环境仍缺外部条件，必须保持 blocked。
- Writing-plans：选择可工程化落点为 Redis broker adapter skeleton、Vault/KMS/Secret Manager resolver skeleton、production smoke blocked 文案、handoff 文档。
- TDD/测试优先：先添加 Redis queue mock client contract 测试和 Vault/KMS/Secret Manager mock client 测试，确认红灯后实现。
- Verification-before-completion：完成定向测试、根级 typecheck/test、demo-web 样式/移动/build、demo-web smoke、production smoke blocked 和 mock-production contract smoke。

## 2. 修复点

可靠队列：

- `apps/api/src/services/api-services.ts`
  - 扩展 `JobQueueTask` 支持 `idempotencyKey` 和 `payload`。
  - 扩展 `JobQueueDescription` 支持 `brokerProvider` 和 `QUEUE_BROKER_SMOKE_NOT_RUN`。
  - 新增 `RedisJobQueueClient`、`RedisJobQueueAdapterOptions`、`RedisJobQueueAdapter`。
  - 新增 `createRedisJobQueueAdapter()` skeleton，使用 mockable client 覆盖 enqueue、lease、retry、dead-letter、heartbeat、idempotency key。
  - `drain()` 不伪造真实 worker 执行，真实 broker/worker smoke 前仍不能声明生产可靠队列通过。

- `apps/api/src/bootstrap/production-services.ts`
  - 新增 `QUEUE_BROKER_PROVIDER` 解析，当前支持 `redis|rabbitmq|sqs` 配置识别，Redis 有 skeleton。
  - `buildProductionQueueContract()` 要求 broker provider、URL、queue name、visibility timeout、retry limit、dead-letter queue。
  - 新增 `createProductionJobQueueAdapter()`，只有 broker 配置完整且注入 Redis client 时返回 Redis adapter skeleton。
  - `createProductionApiServices()` 增加 `redisQueueClient` 和 `queueEnv` 注入点，便于部署方接真实 Redis SDK，也便于测试装配。

密钥库：

- `apps/api/src/bootstrap/production-services.ts`
  - 新增 `VaultSecretResolverClient`、`KmsSecretResolverClient`、`SecretManagerResolverClient`。
  - 新增 `createVaultSecretResolver()`、`createKmsSecretResolver()`、`createSecretManagerResolver()`。
  - 注入 mock/真实 client 时可读取 secret；未注入 SDK/client 时返回 `SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED`。
  - resolver contract 不包含 Vault token、KMS 明文或 Secret Manager secret value。

Production smoke 与交接：

- `scripts/production-smoke.ts`
  - 默认 real-sandbox 缺外部条件时继续输出 `MODE blocked`、`STATUS blocked`。
  - queue blocked 文案更新为 Redis adapter skeleton 已有，但缺真实 broker、worker 绑定和多实例 smoke。

- `.env.example`
  - 增加 `QUEUE_BROKER_PROVIDER="redis"` 占位，不修改真实 `.env`。

- `docs/2026-06-09-p2-production-handoff.md`
  - 补充 Redis adapter skeleton、provider-specific secret resolver skeleton、部署方条件和 blocked 判断。

## 3. 新增/更新测试

- `apps/api/src/services/api-services.test.ts`
  - Redis broker adapter skeleton contract：enqueue 幂等、lease、heartbeat、失败重试、dead-letter、错误脱敏。

- `apps/api/src/bootstrap/production-services.test.ts`
  - Vault/KMS/Secret Manager resolver skeleton mock client 解析和无 client blocked。
  - Redis broker factory 有 mock client 时返回 skeleton，但 `productionReady=false`、`QUEUE_BROKER_SMOKE_NOT_RUN`。
  - 生产服务装配可注入 Redis queue client，但 status 仍明确真实 broker smoke blocked。

- `scripts/production-smoke.test.ts`
  - 更新 queue blocked 文案断言。

- `docs/p2-production-handoff.test.ts`
  - 守护 `QUEUE_BROKER_PROVIDER=redis`、`QUEUE_BROKER_SMOKE_NOT_RUN`、`createRedisJobQueueAdapter()`、`createVaultSecretResolver()` 和 mock-production 边界。

## 4. 验证结果

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：通过，65 passed、1 skipped；345 passed、1 skipped。仍有既有 Node `DEP0040 punycode` deprecation warning。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，15 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、10 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，最大 JS chunk `vendor-arco-_4u-J6Qa.js` 415.91 kB，无 500 kB JS chunk warning。
- `corepack pnpm smoke:demo-web`：通过，`mode=mock-runtime`、`browserE2E=not-run`、`apiHealthOk=true`、`distBundleOk=true`。
- `corepack pnpm smoke:production`：blocked，退出码 2。缺少 `PRODUCTION_SMOKE_BASE_URL`、`PRODUCTION_SMOKE_EMAIL`、`PRODUCTION_SMOKE_PASSWORD`；真实外部 API/OCR/LLM/LIMS smoke 未执行；真实 KMS/Vault/Secret Manager 未接入；真实 broker/worker 多实例 smoke 未执行。
- `PRODUCTION_SMOKE_MODE=mock-production PRODUCTION_SMOKE_RUN_WRITEBACK=1 corepack pnpm smoke:production`：通过，`STATUS passed`。该结果仅代表本地 contract smoke，不代表真实外部 sandbox。

## 5. 仍 blocked 项

- 真实 OCR/LLM/LIMS sandbox：blocked，缺真实 sandbox URL、账号、provider key、LIMS 写回测试环境和审批后的强脱敏样本。
- 真实 KMS/Vault/Secret Manager：blocked，已提供 provider-specific resolver skeleton，但当前环境没有真实 SDK/client/凭据。
- 多实例持久化可靠队列：blocked，Redis adapter skeleton 已有，但缺真实 Redis/RabbitMQ/SQS broker、worker 绑定、lease 超时恢复、retry/dead-letter/heartbeat 多实例 smoke。
- 医疗项目最终产品：不通过，外部集成和多实例生产可靠性未完成真实环境闭环。

## 6. 结论

UI 当前阶段：通过。

P1/P2 本轮工程化阶段：通过。Redis broker adapter skeleton、密钥库 resolver skeleton、production smoke blocked 分类和交接文档已落地并通过测试。

真实外部集成：blocked。不能写成通过。

医疗项目最终产品：不通过。
