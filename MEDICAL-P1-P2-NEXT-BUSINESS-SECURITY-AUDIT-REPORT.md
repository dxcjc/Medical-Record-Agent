# Medical P1/P2 Next Business Security Audit Report

生成时间：2026-06-09 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台，覆盖上传、OCR/LLM 编排、Schema 管理、Provider 运维、字段证据、人工反馈、Evaluation、LIMS 写回、安全审计和 production readiness。

本轮审计边界是可在当前仓库本地落地的 P1/P2 业务/安全闭环，不代表真实 OCR/LLM/LIMS、KMS/Vault/Secret Manager、多实例 session store 或真实 broker 已接入。

## 2. 功能完整性

本轮已补齐：

- 手工写回可信边界：HTTP route 继续丢弃客户端 `fields/payload`，生产 service/executor 只从服务端 `RecognitionResult.payload.writeback.readyFields` 读取可写字段。
- 自动写回可信边界：core workflow 调用 writeback executor 时显式携带 `source: "server-workflow"`，生产 executor 只允许该服务端来源使用 workflow readyFields。
- writeback DTO：`POST /writeback` 只允许 `jobId`、`confirmed: true`、可选非空 `idempotencyKey`。
- writeback response contract：service 返回必须是对象或对象列表，scalar response 不能被包装成业务成功。

已复核仍成立：

- demo API 与生产/非 demo fallback 边界已有测试守护；本轮未发现需要恢复静态 fallback 的变更。
- Evaluation runner 已按 run 的 `schemaKey/schemaVersionId` 解析 schema，不再固定内置 LIMS schema。
- production smoke/readiness 缺真实凭据时返回 blocked，不写 PASS。

## 3. 业务流程完整性

本地闭环继续保持：

登录 -> 上传/创建识别任务 -> 异步队列状态 -> 结果读取 -> 反馈/Evaluation -> 服务端 readyFields 写回 -> 审计 -> readiness/smoke blocked 诊断。

本轮对写回流程的关键收敛：

- 手工写回：二次确认只代表用户授权，不代表客户端 payload 可信。执行时必须重读 job/result，确认 job completed/confirmed、result 不需要复核、readyFields 非空且无阻塞写回 attempt。
- 自动写回：仅 core workflow 内部生成的 `server-workflow` readyFields 可进入 executor；裸 `fields` 输入被拒绝。

真实生产闭环仍未完成：真实 sandbox OCR/LLM/LIMS、真实密钥库、真实共享 session store 和真实 broker 未接入前，不能确认医疗业务最终闭环。

## 4. 用户体验

本轮没有粗暴重写 CSS，也没有改变 Material + Arco Design 体系。`test:styles`、`test:mobile`、demo-web build 和 browser E2E 均通过。

用户侧直接收益主要体现在高风险写回失败不会被误判为成功：非法 writeback payload 返回 400；未准备好的服务端 result 返回 409；真实 production smoke 缺外部凭据时返回 blocked 并给出 required checks。

## 5. 技术实现

关键文件：

- `packages/core/src/engine/jobOrchestrator.ts`：`WritebackExecutionInput` 增加 `source: "server-workflow"`。
- `packages/core/src/engine/langgraphRecognitionWorkflow.ts`：自动写回 executor 调用携带 server workflow source。
- `apps/api/src/bootstrap/production-services.ts`：生产 executor 区分 confirmed 手工路径和 server-workflow 自动路径；裸 fields 被拒绝。
- `apps/api/src/routes/route-dtos.ts`：新增 `confirmedWritebackRouteInputSchema`。
- `apps/api/src/routes/writeback.routes.ts`：DTO 校验、route response guard、eligible list object guard。
- `apps/api/src/services/api-services.ts`：writeback complete response guard。
- `apps/api/src/routes/route-service-contracts.test.ts`：writeback scalar response 编译期守卫。

测试覆盖：

- `apps/api/src/bootstrap/production-services.test.ts`
- `apps/api/src/routes/writeback.routes.test.ts`
- `packages/core/test/jobOrchestrator.test.ts`
- `apps/api/src/routes/route-service-contracts.test.ts`

## 6. P0/P1/P2 问题清单

P0：

- 未发现当前阻断 typecheck、全量测试、demo-web style/mobile/build 或 browser E2E 的本地 P0。

P1 已闭环：

- 生产手工写回不信任客户端 `fields/payload`。
- 生产 executor 不接受未标记为 `server-workflow` 的裸 `fields`。
- Writeback route DTO 收敛，非法 `idempotencyKey` 不进入 service。
- Writeback route service response contract 收紧，scalar response 不会被包装成 200。

P1 remaining/blocked：

- 真实 OCR/LLM/LIMS sandbox 未通过。
- 真实 LIMS 写回 sandbox 未通过 `writeback-readyFields-only-smoke`。
- 真实 KMS/Vault/Secret Manager 未通过 provider/audit redaction smoke。

P2 已闭环：

- 编译期 contract guard 覆盖 writeback route service。
- browser E2E、本地 style/mobile/build、demo-web smoke 和 deployment readiness 本地 gates 继续通过。
- readiness/smoke 输出继续区分 local passed 与 external/final blocked。

P2 remaining/blocked：

- 生产多实例 session invalidation store 真实双实例 smoke。
- 真实 broker 多实例可靠队列 smoke。
- 慢 provider、真实 LIMS sandbox、真实数据下的端到端 UX 仍需外部环境复核。

## 7. 验收结论

验证结果：

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，19 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed / 14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过。
- `corepack pnpm test`：通过，73 passed / 1 skipped files；425 passed / 1 skipped tests。
- `corepack pnpm typecheck`：通过。
- `corepack pnpm smoke:demo-web`：通过。
- `corepack pnpm e2e:demo-web:browser`：通过。
- `corepack pnpm smoke:production`：blocked，exit 2，未配置真实外部凭据。
- `corepack pnpm readiness:external-blockers`：blocked，exit 2。
- `corepack pnpm readiness:session-invalidation`：blocked，exit 2。
- `corepack pnpm readiness:deployment`：blocked，exit 2；本地 readiness passed，真实外部集成 blocked，最终产品 blocked。

分层结论：

- UI/本地代码阶段：通过。
- 业务/安全 P1/P2 本轮阶段：通过。
- 真实外部集成：blocked。
- 医疗最终产品：不通过/blocked。真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session store、真实 broker 多实例可靠队列和真实 production smoke 全部通过前，不能写最终产品通过。
