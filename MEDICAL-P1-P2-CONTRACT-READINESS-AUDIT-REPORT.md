# Medical P1/P2 Contract Readiness Audit Report

生成时间：2026-06-09 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台，覆盖上传、OCR/LLM 编排、Schema、Provider、Evaluation、反馈、LIMS 写回、审计与生产 readiness。

本轮聚焦 PRODUCT-AUDIT 与 rollup 中仍可本地推进的 P1/P2：schemas/providers/audit route contract、response guard、production smoke/readiness blocked 诊断和 handoff 可执行契约。UI 不是本轮主目标，但必须保持现有 Material + Arco Design 和 build/chunk 稳定。

## 2. 功能完整性

本轮已完成：

- Schema API：草稿创建/更新/校验、发布、compare query 使用 DTO；非法 body/query 返回 400；客户端伪造 actor/status/createdById 不透传。
- Provider API：保存配置使用 DTO；`config/secretRefs` 要求对象；secretRefs 响应继续脱敏；非法配置返回 400；scalar response 不再伪装成功。
- Audit API：查询 DTO 收敛，`take` 最大 100，未知字段不透传；scalar audit item 进入 response guard。
- Production smoke：blocked step 输出 `NEXT`、`REQUIRED_CHECKS`、扩展 `SUMMARY_JSON`。
- Readiness gate：解析 `SUMMARY_JSON` 并输出 `blockedDiagnostics` 与 `BLOCKED_DETAIL`。
- Handoff：生产交接文档写明机器可读 blocked 字段和不能写通过的边界。

未完成且不能伪造：

- 真实 OCR/LLM/LIMS sandbox。
- 真实 KMS/Vault/Secret Manager。
- 生产多实例 session invalidation store。
- 真实 broker 多实例可靠队列。

## 3. 业务流程完整性

本地/契约层链路继续推进为：登录 -> 上传/创建识别 -> Schema/Provider DTO 校验 -> 执行或排队 -> 结果/反馈/Evaluation -> 服务端 readyFields 写回 -> 审计 -> smoke/readiness 诊断。

本轮补强点在运维和安全边界：Schema、Provider、Audit 的 HTTP 边界不再把宽 body 或 scalar service response 当成正常业务结果；production smoke/readiness 不再只给自然语言 blocked，而是提供可机器解析的缺项、下一步动作和必须补跑检查。

真实业务闭环仍 blocked：没有真实外部 OCR/LLM/LIMS sandbox 与真实生产依赖时，只能确认本地 contract 和 mock-production contract，不能确认医疗最终业务闭环。

## 4. 用户体验

UI 当前阶段保持：

- Material + Arco Design token 未被重写。
- `test:styles`、`test:mobile` 均通过。
- demo-web build 通过，无 500 kB JS chunk warning。

用户侧改进主要体现在错误和交接可诊断性：非法配置更早返回 400；生产 smoke 输出明确的 `blocked` 分类、`nextAction` 和 `requiredChecks`，减少把缺真实外部依赖误写为产品通过的风险。

## 5. 技术实现

关键实现：

- `route-dtos.ts`：新增 `schemaDraftRouteInputSchema`、`updateSchemaDraftRouteInputSchema`、`publishSchemaDraftRouteInputSchema`、`compareSchemaVersionsQuerySchema`、`providerConfigRouteInputSchema`、`auditListQuerySchema`、`assertRouteResponseObject*`。
- `schemas.routes.ts`：Zod DTO + response guard，保持 `{items|draft|validation|version|comparison}` 响应形态。
- `providers.routes.ts`：Zod DTO + response guard + secretRefs 递归脱敏，保持 `{items|provider|health}` 响应形态。
- `audit.routes.ts`：Zod query DTO + response guard，保持 `{items}` 响应形态。
- `production-smoke.ts`：blocked step 结构化诊断字段、CLI `NEXT/REQUIRED_CHECKS/SUMMARY_JSON`。
- `deployment-readiness-gate.ts`：从 production smoke `SUMMARY_JSON` 提取 `blockedDiagnostics`。

测试采用 TDD：先增加 schema/provider/audit 失败用例和 smoke/readiness 诊断断言，确认红灯后实现，最终全量绿。

## 6. P0/P1/P2 问题清单

P0：

- 未发现当前 build、typecheck、全量测试、demo-web style/mobile/build 阻断级 P0。

P1 已推进：

- schemas/providers/audit route request contract 收敛。
- route response guard 阻止 scalar 被包装成成功响应。
- Provider secretRefs 继续脱敏，非法 config/secretRefs shape 不写入。
- Production smoke/readiness blocked 输出可机器解析、可交接。

P1 still blocked：

- 真实 OCR/LLM/LIMS sandbox 未配置，真实 production smoke 未通过。
- 真实 LIMS 写回 sandbox 未验收。

P2 已推进：

- Handoff 文档增加 `SUMMARY_JSON`、`nextAction`、`requiredChecks`、`BLOCKED_DETAIL`。
- demo-web chunk/style/mobile/build 稳定。

P2 still blocked：

- 真实 KMS/Vault/Secret Manager。
- 生产多实例 session invalidation store。
- 真实 Redis/RabbitMQ/SQS broker 多实例可靠队列。
- 数据库集成测试在当前环境仍按设计 skipped；`punycode` warning 仍存在。

## 7. 验收结论

验证结果：

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，19 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，入口 `index-9cuUF0bK.js`，最大 JS chunk 415.91 kB，无 500 kB JS warning。
- `corepack pnpm test`：通过，67 passed、1 skipped files；387 passed、1 skipped tests。
- `corepack pnpm typecheck`：通过。
- `corepack pnpm smoke:production`：exit code 2，`STATUS blocked`，输出 `NEXT`、`REQUIRED_CHECKS`、`SUMMARY_JSON`。

分层验收：

- UI 当前阶段：通过。
- P1/P2 本轮可落地项：通过。
- 真实外部集成：blocked。
- 医疗最终产品：blocked。真实 OCR/LLM/LIMS、真实 KMS/Vault/Secret Manager、生产多实例 session store、真实 broker 多实例队列和真实 production smoke 全部完成前，不得声明医疗项目最终完成。
