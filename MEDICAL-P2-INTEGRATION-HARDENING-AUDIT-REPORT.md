# Medical P2 Integration Hardening Audit Report

生成时间：2026-06-09 07:52:15 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台。产品链路覆盖上传、OCR/LLM 编排、Schema 结构化、证据追踪、人工复核、Evaluation、LIMS 写回、Provider 运维、安全审计和 smoke 验证。

本轮审计聚焦 P1/P2 集成加固闭环：密钥解析边界、Provider secretRef 脱敏诊断、队列 broker contract、production smoke 状态分类。UI 当前 build/smoke 通过不等于真实医疗生产闭环完成。

## 2. 功能完整性

已闭环：

- SecretResolver 可插拔 contract：`env`、`vault`、`kms`、`secret-manager` 均有工厂/contract 边界。
- Vault/KMS/Secret Manager skeleton 支持注入 client；未接真实外部服务时 fail-fast blocked。
- Provider health 对 secretRef 解析失败只返回 provider key、secretRef、resolver source、blocked reason，不返回明文密钥。
- Redis broker queue skeleton 覆盖幂等入队、lease、retry、dead-letter、heartbeat 的 contract 测试。
- in-process queue 明确 `productionReady=false`，只适合单实例本地闭环。
- production smoke 可区分 `passed`、`blocked`、`failed`。

未闭环：

- 真实 OCR/LLM/LIMS sandbox 未配置。
- 真实 KMS/Vault/Secret Manager SDK、凭据和生产密钥库读取未接入。
- 真实 Redis/RabbitMQ/SQS broker、worker 绑定、多实例可靠性 smoke 未完成。

## 3. 业务流程完整性

本地流程可验证：demo-web mock runtime 可完成关键页面 smoke；API 单元/组合测试覆盖 Provider、识别任务、写回、审计、Evaluation、Schema、队列 contract 和 production smoke 分类。

真实生产流程仍 blocked：`corepack pnpm smoke:production` 当前输出 `STATUS blocked`，缺少真实外部 sandbox 登录信息、真实密钥库和真实 broker。该状态不能作为生产验收通过。

## 4. 用户体验

本轮没有重写 UI/CSS。demo-web production build 通过，`smoke:demo-web` 验证 `/login`、`/`、`/recognition/new`、`/recognition/jobs/demo`、`/providers`、`/writeback`，并确认 `apiHealthOk=true`、`distBundleOk=true`。

用户侧风险主要不在视觉层，而在运维状态表达：当前已能把外部条件缺失显示为 blocked，避免用户或部署方把 mock/runtime 本地通过误读为真实生产可用。

## 5. 技术实现

关键文件：

- `apps/api/src/bootstrap/production-services.ts`
  - `buildSecretResolverContract()`、`createSecretResolverFromEnv()`、`createVaultSecretResolver()`、`createKmsSecretResolver()`、`createSecretManagerResolver()`。
  - 外部 resolver 无真实 client 时返回 blocked；有注入 client 时可解析测试 secret。
  - production queue contract 保留 broker 配置和 blocked 语义。

- `apps/api/src/services/api-services.ts`
  - `JobQueueAdapter`、`RedisJobQueueAdapter`、`RedisJobQueueClient`。
  - `createRedisJobQueueAdapter()` 提供 lease/retry/dead-letter/heartbeat/幂等语义 skeleton。
  - Redis skeleton 仍声明 `productionReady=false`、`QUEUE_BROKER_SMOKE_NOT_RUN`。

技术判断：当前修复是 contract boundary hardening，不引入真实外部 SDK，不声称真实生产接入完成。

## 6. P0/P1/P2 问题清单

P0：

- 当前本地 `typecheck`、全量测试、demo-web build、demo-web smoke 未发现阻断项。

P1 已修复：

- `production-services.test.ts` 导入的三类外部 SecretResolver factory 已补齐真实导出和最小 contract。
- 外部 SecretResolver 的 blocked/contract/injected-client 语义已通过测试。
- Provider secretRef blocked 诊断保持脱敏。

P1 remaining/blocked：

- 真实 KMS/Vault/Secret Manager 接入。
- 真实 OCR/LLM/LIMS sandbox smoke。

P2 已修复：

- `api-services.test.ts` 需要的 Redis queue adapter/type contract 已补齐。
- Redis broker skeleton 的 lease、retry、dead-letter、heartbeat、幂等语义已通过测试。
- Queue contract 不再被误判为 production ready。

P2 remaining/blocked：

- 真实 Redis/RabbitMQ/SQS broker adapter。
- 多实例 worker 绑定、租约续期、失败重试、DLQ 消费和状态一致性 smoke。
- 真实 production smoke 的 `STATUS passed`。

## 7. 验收结论

已执行命令：

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：通过，Test Files `65 passed | 1 skipped (66)`；Tests `344 passed | 1 skipped (345)`。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过。
- `corepack pnpm smoke:demo-web`：通过。
- `corepack pnpm smoke:production`：blocked，退出码 2，`MODE blocked`、`STATUS blocked`。

分层结论：

- 本地 P1/P2 集成加固：通过。
- demo-web 当前本地体验验证：通过。
- 真实外部集成：不通过，blocked。
- 医疗项目最终生产验收：不通过；缺真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、真实 broker 和多实例可靠性 smoke。
