# Medical P1/P2 Next Local Actionability Audit Report

生成时间：2026-06-10 02:26:17 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台，覆盖上传、OCR/LLM 编排、Schema、证据、人工反馈、Evaluation、LIMS 写回、Provider 运维、安全审计和 production readiness。

本轮审计不把 UI 当前阶段通过误判为项目最终完成。审计重点是当前仓库仍可本地闭环的 P1/P2 API 契约缺口：高价值业务路由不能把异常 service scalar response 当成成功业务响应。

## 2. 功能完整性

本轮已完成：

- Files：`POST /files` 创建结果必须是对象。
- Jobs：`POST /jobs` 和 `GET /jobs/:id` 结果必须是对象。
- Results：`GET /results/:jobId` service contract 收紧为对象或 null。
- Feedback：`POST /feedback` 反馈创建结果必须是对象。
- Evaluation：datasets、samples、runs、metrics 的列表项和单对象包装响应均有 route-level object guard。
- 编译期契约：files/jobs/feedback/results/evaluation route service scalar response fixture 被 TypeScript 拒绝。

未在本轮改变：

- UI/CSS 与 Material + Arco Design。
- 真实 OCR/LLM/LIMS、KMS/Vault/Secret Manager、session store、broker 等外部依赖状态。

## 3. 业务流程完整性

本地业务流程增强：

登录鉴权 -> 上传文件/创建识别 job/读取结果/提交反馈/管理 Evaluation -> route DTO 校验 -> service 执行 -> route response object guard -> 客户端只接收结构化对象响应。

风险收敛点：

- 异常注入、错误 mock 或未来 service 漂移返回 `"ok"`、`true`、数字、数组中的 scalar 时，不再被包装成 200/201 成功响应。
- Results API 从 `unknown` 收紧为 `ApiRouteResponseObject | null`，与 jobs/files/feedback/evaluation 的 route-facing contract 对齐。

真实生产闭环仍未完成：真实 sandbox 和多实例外部依赖未通过前，不能确认医疗识别、写回和运维流程的最终生产闭环。

## 4. 用户体验

本轮没有修改 demo-web CSS，不影响企业级 Material + Arco Design：Primary `#3370FF`、背景 `#F7F8FA`、白色侧栏、active nav pill、DM Sans + Noto Sans SC、移动端抽屉/单列/44px 触摸区继续由 style/mobile/build/browser E2E 守卫验证。

用户侧收益是错误不会伪装为成功数据。API 后端若发生 route-facing response contract 漂移，会返回 500 诊断，而不是让前端页面把非对象响应当作业务实体继续渲染。

## 5. 技术实现

关键实现：

- `apps/api/src/routes/files.routes.ts`、`jobs.routes.ts`、`results.routes.ts`、`feedback.routes.ts`、`evaluation.routes.ts`
  - 出站位置增加 `assertRouteResponseObject` / `assertRouteResponseObjectList`。
- `apps/api/src/routes/route-service-contracts.test.ts`
  - 扩展编译期 contract guard，覆盖 files/jobs/feedback/results/evaluation。
- `apps/api/src/routes/base.routes.test.ts`、`evaluation.routes.test.ts`
  - 增加 runtime unsafe-cast service response 测试。
- `apps/api/src/demo-services.ts`
  - demo result service 返回对象副本或 null。
- `apps/api/src/services/api-services.ts`
  - production result service 从 repository 读取后执行 `assertRouteRecord(result, "RESULT_RESPONSE_INVALID")`。

技术判断：这是本地 contract hardening，不引入真实外部 SDK，不把外部 blocked 改判为 passed。

## 6. 问题清单（P0/P1/P2）

P0：

- 当前未发现阻断 typecheck、demo-web build、全量测试或 9901 基础访问的本地 P0。

P1 已闭环：

- Files/jobs/feedback/results/evaluation route-facing response 不再接受 scalar 成功响应。
- Results route service 不再暴露 `unknown | null`。
- 编译期和运行时双层守卫覆盖本轮路由。

P1 remaining/blocked：

- 真实 OCR/LLM/LIMS sandbox 未通过。
- 真实 LIMS 写回 sandbox 未通过 `writeback-readyFields-only-smoke`。
- 真实 KMS/Vault/Secret Manager 未通过 secret resolution 和 redaction smoke。

P2 已闭环：

- 本轮新增 12 个 runtime guard 用例和 route service 编译期 guard。
- `readiness:deployment` 本地 gate 继续通过，exit 2 仅来自外部 blocked。
- 9901 静态部署与 dist 新 bundle 一致。

P2 remaining/blocked：

- 生产多实例 session invalidation store 真实双实例 smoke。
- 真实 broker 多 worker lease/retry/dead-letter/heartbeat/status-result consistency/idempotency smoke。
- 慢 provider、真实 LIMS sandbox、真实数据下的端到端 UX 仍需外部环境复核。
- upstream `DEP0040 punycode` warning 仍存在。

## 7. 验收结论

本地可闭环阶段：通过。

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，19 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed / 14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，入口 `/assets/index-BI5ExnF3.js`，最大 JS chunk 415.91 kB。
- `corepack pnpm test`：通过，75 passed / 1 skipped files；443 passed / 1 skipped tests。
- 9901 `/` 和 `/api/health`：均 200 OK；dist 与 9901 HTML 引用同一新 bundle。

真实外部集成：blocked。

- `corepack pnpm readiness:deployment` exit 2。
- blocked 限定为真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session invalidation store、真实 broker/queue 多实例 smoke。

医疗最终产品：blocked。

- 本轮 API contract hardening 和 UI/本地 gate 通过不等同于医疗最终产品完成。
- 真实外部 sandbox、真实密钥库、真实多实例 session store、真实 broker 和生产 smoke 全部通过前，不能改判最终产品通过。
