# Medical P1/P2 Contract Hardening Audit Report

生成时间：2026-06-09 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台。产品主线覆盖文件上传、OCR/LLM 编排、Schema 管理、字段证据、人工反馈、Evaluation、LIMS 写回、Provider 运维、安全审计和生产 readiness。

本轮审计范围聚焦 P1/P2 业务/安全/集成残余中可在当前环境本地落地的部分：API response contract、Provider secretRef 响应安全、Audit 历史 metadata 脱敏兜底和生产交接可执行性。真实外部 sandbox/KMS/session store/broker 继续按 blocked 处理。

## 2. 功能完整性

已补强：

- Provider API response 出口统一脱敏，覆盖 list、save、set default、health。
- Provider health 返回中的 `secretDiagnostics.value`、probe headers 和 Bearer 字符串不回显明文。
- Provider `secretRefs` 只返回 configured 状态，避免 secretRef 值或密钥值泄漏。
- Audit list response 对历史 metadata 做脱敏兜底，避免旧数据或外部导入记录携带 token/password/apiKey。
- Production handoff 增加 provider response、provider health、audit metadata 的 redaction smoke。
- 保持 schemas、files、jobs、feedback、evaluation、writeback 前序 DTO/response contract 测试通过。

未伪造完成：

- 未接真实 OCR/LLM/LIMS sandbox。
- 未接真实 KMS/Vault/Secret Manager。
- 未接生产多实例 session invalidation store。
- 未接真实 broker 队列。

## 3. 业务流程完整性

当前本地业务链路继续保持：

登录 -> 上传病历文件 -> DTO 校验和白名单入参 -> 创建识别任务 -> demo/mock 或配置编排执行 -> 保存识别结果 -> 查看字段/证据/trace -> 反馈/Evaluation -> 服务端复核 readyFields -> 写回尝试 -> 审计与 readiness 诊断。

本轮对高风险运维链路的闭环增强：

- Provider 配置保存仍拒绝 `config.apiKey`、`headers.Authorization` 等明文密钥。
- Provider 列表和健康检查即使 service 返回宽对象，也会在 route response 出口脱敏。
- Audit 查询即使读取到历史脏 metadata，也不会把 token/password/apiKey 带给前端。
- Production handoff 明确部署方解除 blocked 前必须执行 redaction smoke。

业务边界：

- `mock-production` 只能代表本地 contract smoke，不代表真实外部 sandbox。
- `smoke:production` 当前仍 blocked，不能用于最终产品通过结论。

## 4. 用户体验

本轮未做 UI 重写，未改动 demo-web CSS。Material + Arco Design 基线继续由测试守住：

- Primary `#3370FF`、背景 `#F7F8FA`、白色侧栏、active nav pill。
- `DM Sans + Noto Sans SC` 字体。
- 移动端抽屉、单列布局和 44px 触摸区。
- demo-web build 无 500 kB JS chunk warning。

用户侧收益主要体现在运维安全与可诊断性：

- Provider 页面和健康检查不会因为后端宽响应漂移而显示明文密钥。
- Audit 页面不会展示历史 metadata 里的认证头或 token。
- 交接文档把 redaction smoke 写成可执行检查项，减少部署方误判。

## 5. 技术实现

关键文件：

- `apps/api/src/routes/route-dtos.ts`
  - 新增 `redactSensitiveRouteValue()`。
  - 对 `secretRefs` 输出 configured 状态。
  - 对 `apiKey`、`apiToken`、`Authorization`、`x-api-token`、password、clientSecret、`secretDiagnostics.value` 和 Bearer 字符串做响应脱敏。

- `apps/api/src/routes/providers.routes.ts`
  - Provider list、default、save、health response 全部接入统一 scrubber。
  - 错误响应继续只返回稳定 code，不返回 Error.message。

- `apps/api/src/routes/audit.routes.ts`
  - Audit list response 在返回前调用统一 scrubber。

- `apps/api/src/routes/providers.routes.test.ts`
  - 新增 provider 深度响应脱敏和 health secretDiagnostics 脱敏回归测试。

- `apps/api/src/routes/audit.routes.test.ts`
  - 新增历史 audit metadata 中 token/password/apiKey 脱敏回归测试。

- `docs/2026-06-09-p2-production-handoff.md`
  - 新增 `provider-response-secret-redaction-smoke`、`provider-health-secret-redaction-smoke`、`audit-metadata-secret-redaction-smoke`。

- `docs/p2-production-handoff.test.ts`
  - 新增交接文档 redaction smoke 守卫。

## 6. P0/P1/P2 问题清单

P0：

- 未发现当前阻断 demo-web build、全量测试、9901 根路径或 `/api/health` 的 P0。

P1 已推进：

- Provider route response 不再只脱敏 `secretRefs`，已覆盖嵌套明文字段和 Bearer 字符串。
- Provider health 不回显 resolved secret 或认证 header。
- Audit list response 对历史 metadata 明文敏感字段做兜底脱敏。
- Production handoff 增加可执行 redaction smoke。

P1 still blocked：

- 真实 OCR/LLM/LIMS sandbox 未配置且未通过真实 smoke。
- 真实 production smoke 当前仍 `STATUS blocked`。
- 真实密钥库和 provider health secretRef 外部解析未完成。

P2 已推进：

- 定向 contract 测试覆盖 providers/audit/schemas/base/evaluation/writeback/service/handoff。
- demo-web style/mobile/build 守卫继续通过。
- 9901 根路径和 `/api/health` 继续可访问。

P2 still blocked：

- 真实 KMS/Vault/Secret Manager resolver client/SDK 未接入。
- 生产多实例 session invalidation store 未接真实数据库/Redis repository 并通过多实例 smoke。
- 真实 Redis/RabbitMQ/SQS broker 队列、多 worker lease/retry/dead-letter/heartbeat/status consistency smoke 未通过。

残余非阻断：

- `corepack pnpm test` 仍输出既有 Node `DEP0040 punycode` deprecation warning。
- `apps/api/src/repositories/repositoryDatabase.integration.test.ts` 当前环境按设计 skipped。

## 7. 验收结论

必跑命令：

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm --filter @medical-record-agent/demo-web test:styles` | 通过，19 tests passed。 |
| `corepack pnpm --filter @medical-record-agent/demo-web test:mobile` | 通过，5 passed / 14 skipped。 |
| `corepack pnpm --filter @medical-record-agent/demo-web build` | 通过，无 500 kB JS chunk warning。 |
| `corepack pnpm test` | 通过，68 passed / 1 skipped files；402 passed / 1 skipped tests；只有既有 `DEP0040 punycode` warning。 |

定向测试：

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm vitest run apps/api/src/routes/providers.routes.test.ts apps/api/src/routes/audit.routes.test.ts` | 先红后绿；最终 21 tests passed。 |
| `corepack pnpm vitest run docs/p2-production-handoff.test.ts` | 先红后绿；最终 5 tests passed。 |
| `corepack pnpm vitest run apps/api/src/routes/providers.routes.test.ts apps/api/src/routes/audit.routes.test.ts apps/api/src/routes/schemas.routes.test.ts apps/api/src/routes/base.routes.test.ts apps/api/src/routes/evaluation.routes.test.ts apps/api/src/routes/writeback.routes.test.ts apps/api/src/services/api-services.test.ts docs/p2-production-handoff.test.ts` | 81 tests passed。 |
| `corepack pnpm typecheck` | 通过。 |

9901 与 dist 检查：

- `curl -I --max-time 5 http://localhost:9901/`：200 OK。
- `curl --max-time 5 http://localhost:9901/api/health`：200 OK，`{"status":"ok","service":"medical-record-agent-api"}`。
- `apps/demo-web/dist/index.html` 当前引用 `/assets/index-DQ-Z7-_K.js`，对应文件存在。

Production smoke：

- `corepack pnpm smoke:production`：exit code 2，`MODE blocked`、`STATUS blocked`。
- blocked steps：`configuration`、`secret-resolver`、`session-invalidation-store`、`queue-broker`。
- 输出包含 `SUMMARY_JSON`，不能写成 passed。

分层结论：

- UI 当前阶段：通过。
- P1/P2 本轮 contract/security/handoff 阶段：通过。
- 真实外部集成：blocked。
- 医疗项目最终产品：blocked。
