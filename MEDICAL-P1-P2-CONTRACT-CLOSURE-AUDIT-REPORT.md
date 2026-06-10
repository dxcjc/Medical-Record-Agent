# Medical P1/P2 Contract Closure Audit Report

生成时间：2026-06-09 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台。产品主线覆盖上传、OCR/LLM 编排、Schema 管理、字段证据、人工反馈、Evaluation、LIMS 写回、Provider 运维、安全审计和生产 readiness。

本轮目标不是宣布医疗最终完成，而是继续推进不依赖真实外部凭据的 P1/P2 contract closure：收紧 Provider 配置保存和 Audit 查询边界，避免 API 契约漂移和密钥配置误用。

## 2. 功能完整性

本轮已完成：

- Provider 配置保存继续支持 `kind/displayName/enabled/isDefault/config/secretRefs`。
- Provider `secretRefs` 现在必须是非空字符串引用。
- Provider `config` 现在拒绝疑似明文密钥字段，包括 `apiKey`、`token`、`password`、`secret`、`clientSecret`、`authorization` 等递归路径。
- Provider 列表、默认设置、健康检查响应仍做 `secretRefs` 脱敏。
- Audit 查询保留 `actorUserId/actorApiTokenId/action/take` 白名单。
- Audit `take` 非法值返回 400；合法值上限仍为 100。

未完成但不得伪造：

- 未接真实 OCR/LLM/LIMS sandbox。
- 未接真实 KMS/Vault/Secret Manager。
- 未接生产多实例 session invalidation store。
- 未接真实 Redis/RabbitMQ/SQS broker。
- 未执行真实 production passed smoke。

## 3. 业务流程完整性

Provider 运维流程本轮更安全：

运维人员保存 Provider 配置 -> route DTO 校验 -> 明文密钥字段被 400 截断 -> 只允许 `secretRefs` 引用名进入 provider registry -> 响应脱敏 -> 后续 provider runtime 通过 secret resolver 解析引用。

Audit 查询流程本轮更确定：

审计用户请求 `/audit` -> route DTO 解析 query -> 未知字段剥离 -> 非法分页返回 400 -> 合法 `take` 上限 100 -> service 只收到收敛后的查询对象。

识别、Evaluation、写回、session、queue 等主流程沿用前序实现。本轮未改变 LIMS 写回执行边界，仍不能把客户端 `fields/payload` 作为写回真源。

## 4. 用户体验

本轮未改 UI CSS，也未重写前端页面。当前 Material + Arco Design 阶段继续保持：

- Primary `#3370FF`、背景 `#F7F8FA`、白色侧栏、active nav pill。
- `DM Sans + Noto Sans SC` 字体。
- 移动端抽屉、单列布局、44px 触摸区 guard 继续通过。

用户侧影响：

- Provider 配置误把真实密钥填入 `config` 时，后端会明确 400 拒绝，避免把明文配置落入 registry/repository。
- Audit 非法分页参数不再被悄悄忽略，便于前端和集成调用方尽早发现契约错误。

## 5. 技术实现

关键实现：

- `apps/api/src/routes/route-dtos.ts`
  - `secretRefsRouteInputSchema = z.record(nonEmptyString)`。
  - `findPlaintextSecretConfigPath()` 递归扫描 provider config。
  - `providerConfigRouteInputSchema.superRefine()` 拒绝疑似明文密钥字段。
  - `parsePositiveIntegerQueryValue()` 严格解析 audit `take`。

- `apps/api/src/routes/providers.routes.test.ts`
  - 覆盖明文 `config.apiKey`、嵌套 `headers.Authorization` 拒绝。
  - 覆盖对象型和空字符串 `secretRefs` 拒绝。

- `apps/api/src/routes/audit.routes.test.ts`
  - 覆盖未知 query 字段剥离。
  - 覆盖 `take=12abc` 返回 400 且不调用 service。

验证覆盖：

- Provider/audit route 定向测试。
- Provider 前端保存路径和 API client 测试。
- API service 组合、schema route、demo services 回归。
- demo-web style/mobile/build 和全量测试。
- 9901 首页和 `/api/health` 基础访问。

## 6. P0/P1/P2 问题清单

P0：

- 未发现当前阻断 demo-web build、全量测试、style/mobile guard 或 9901 基础访问的 P0。

P1 已推进：

- Provider 配置 DTO 不再允许 `config` 携带疑似明文密钥。
- Provider `secretRefs` 从宽对象值收敛为非空字符串引用。
- Audit query DTO 对非法分页值显式 400，避免 API 契约漂移。

P1 remaining/blocked：

- schemas/providers/audit 之外的底层 repository `unknown` 边界仍可继续分阶段收敛。
- 真实 production smoke 未通过，仍 blocked。
- 真实 OCR/LLM/LIMS sandbox 未配置。

P2 已推进：

- 保持 UI style/mobile/build guard 通过。
- 保持 provider response secretRefs 脱敏回归。
- 保持 production smoke blocked 诊断机器可读输出。

P2 remaining/blocked：

- 真实 KMS/Vault/Secret Manager resolver 未接真实 client/SDK。
- 生产多实例 session invalidation store 未通过双实例 smoke。
- 真实 broker 多实例可靠队列未通过 lease/retry/dead-letter/heartbeat/status consistency smoke。
- 全量测试仍有既有 Node `DEP0040 punycode` warning；数据库 repository integration 当前环境按设计 skipped。

## 7. 验收结论

验证命令：

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm vitest run apps/api/src/routes/audit.routes.test.ts apps/api/src/routes/providers.routes.test.ts` | 通过，18 tests passed。 |
| `corepack pnpm vitest run apps/api/src/routes/providers.routes.test.ts apps/api/src/routes/audit.routes.test.ts apps/api/src/routes/schemas.routes.test.ts apps/api/src/services/api-services.test.ts apps/api/src/demo-services.test.ts apps/demo-web/src/pages/operations/ProviderSettingsPage.test.ts apps/demo-web/src/api/client.test.ts` | 通过，69 tests passed。 |
| `corepack pnpm typecheck` | 通过。 |
| `corepack pnpm --filter @medical-record-agent/demo-web test:styles` | 通过，19 tests passed。 |
| `corepack pnpm --filter @medical-record-agent/demo-web test:mobile` | 通过，5 passed、14 skipped。 |
| `corepack pnpm --filter @medical-record-agent/demo-web build` | 通过，无 500 kB JS warning。 |
| `corepack pnpm test` | 通过，68 passed、1 skipped files；398 passed、1 skipped tests。 |
| `corepack pnpm smoke:production` | exit code 2，`STATUS blocked`；缺真实外部依赖，不是 passed。 |

9901：

- `/`：200 OK。
- `/api/health`：200 OK。

分层结论：

- UI 当前阶段：通过。本轮未改 UI，style/mobile/build 和 9901 基础访问继续通过。
- P1/P2 本轮工程项：通过。Provider/Audit contract hardening 有代码、红绿测试、typecheck 和全量测试验证。
- 真实外部集成：blocked。真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session store、真实 broker 均未完成。
- 医疗最终产品：blocked。不能把本地 contract closure 或 UI 当前阶段通过写成医疗最终完成。
