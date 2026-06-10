# Medical P1/P2 Next Local Actionability Fix Report

生成时间：2026-06-10 02:26:17 CST / Asia/Shanghai

## 本轮修复范围

本轮继续推进不依赖真实外部凭据的 P1/P2 本地闭环项。未修改 UI/CSS，未提交 git commit，未修改 `.env`、`node_modules` 或无关缓存。

修复点：route-facing API response contract hardening。

## TDD 红绿

红灯：

- 新增 files/jobs/feedback/results/evaluation 异常 service 响应测试。
- 初次运行 `corepack pnpm vitest run apps/api/src/routes/base.routes.test.ts apps/api/src/routes/evaluation.routes.test.ts --reporter=dot` 失败，12 个用例证明 unsafe-cast scalar service response 会返回 200/201。

绿灯：

- 路由层增加 `assertRouteResponseObject` / `assertRouteResponseObjectList`。
- `ResultRouteService.getByJobId()` 从 `unknown | null` 收紧为 `ApiRouteResponseObject | null`。
- `apps/api/src/demo-services.ts` 和 `apps/api/src/services/api-services.ts` 同步收紧 result service 返回边界。
- `route-service-contracts.test.ts` 增加 files/jobs/feedback/results/evaluation 编译期 scalar response guard。

## 修改文件

- `apps/api/src/routes/files.routes.ts`
- `apps/api/src/routes/jobs.routes.ts`
- `apps/api/src/routes/results.routes.ts`
- `apps/api/src/routes/feedback.routes.ts`
- `apps/api/src/routes/evaluation.routes.ts`
- `apps/api/src/routes/base.routes.test.ts`
- `apps/api/src/routes/evaluation.routes.test.ts`
- `apps/api/src/routes/route-service-contracts.test.ts`
- `apps/api/src/demo-services.ts`
- `apps/api/src/services/api-services.ts`
- `docs/superpowers/plans/2026-06-10-p1-p2-next-local-actionability.md`

## 验证结果

- `corepack pnpm vitest run apps/api/src/routes/base.routes.test.ts apps/api/src/routes/evaluation.routes.test.ts apps/api/src/routes/route-service-contracts.test.ts --reporter=dot`：通过，37 tests。
- `corepack pnpm --filter @medical-record-agent/api typecheck`：通过。
- `corepack pnpm typecheck`：通过。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，19 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed / 14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，入口 `/assets/index-BI5ExnF3.js`，最大 JS chunk `vendor-arco-_4u-J6Qa.js` 415.91 kB。
- `corepack pnpm test`：通过，75 passed / 1 skipped files；443 passed / 1 skipped tests；仍有既有 upstream `DEP0040 punycode` warning。
- `corepack pnpm readiness:deployment`：exit 2，预期 blocked；本地 gate 均 passed，blocked 仅限真实外部集成。
- 9901 `/`：200 OK。
- 9901 `/api/health`：200 OK，`{"status":"ok","service":"medical-record-agent-api"}`。
- `apps/demo-web/dist/index.html` 与 9901 HTML 引用同一组 JS bundle，包括 `/assets/index-BI5ExnF3.js`。

## 剩余 blocked

- 真实 OCR/LLM/LIMS sandbox 未配置且未通过真实 smoke。
- 真实 KMS/Vault/Secret Manager 未接真实 client/SDK。
- 生产多实例 session invalidation store 未通过双实例 smoke。
- 真实 Redis/RabbitMQ/SQS broker 多 worker smoke 未通过。
- 慢 provider 下队列积压、重试、失败可视化仍需真实外部环境。

结论：本轮 API 契约本地闭环通过；真实外部集成和医疗最终产品仍 blocked。

## 2026-06-10 产品级 7 维归档补齐

### 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台，覆盖上传、OCR/LLM 编排、Schema、证据、人工反馈、Evaluation、LIMS 写回、Provider 运维、安全审计和 production readiness。

本报告原始范围是 route-facing API response contract hardening。按产品审计工作流补齐后，它只能证明本地 API 契约阶段通过，不能证明真实外部集成或医疗最终产品通过。

### 2. 功能完整性

本轮已补齐 files、jobs、results、feedback、evaluation 这些关键 API 路由的出站 response object guard，并用编译期 contract guard 防止 service fixture 返回 scalar response。页面 UI、CSS、9901 nginx 路径和 `/api` 代理未修改。

同时，前序已闭环的写回 readyFields-only、demo fallback 门禁、Evaluation schema selection、provider/audit redaction、session/queue readiness 和 production smoke blocked diagnostic 继续由现有测试与 handoff 文档守护。

### 3. 业务流程完整性

本地业务流程增强为：上传文件 -> 创建识别 job -> 读取 result -> 提交 feedback -> 创建/读取 evaluation -> route DTO 校验 -> service 执行 -> route response object guard -> 前端只接收结构化对象响应。

该流程避免异常 service scalar response 被包装成成功业务响应，但不替代真实 OCR/LLM/LIMS、真实密钥库、多实例 session store 或真实 broker smoke。真实外部集成仍 blocked。

### 4. 用户体验

本轮没有修改 UI/CSS，继续保持企业级 Material + Arco Design：Primary `#3370FF`、背景 `#F7F8FA`、白色侧栏、active nav pill、DM Sans + Noto Sans SC、移动端抽屉/单列/44px 触摸区。

用户侧收益是异常 API contract 漂移不会伪装为成功数据；后端会暴露明确 500 诊断，降低医疗流程中错误数据继续渲染或被误判为可操作结果的风险。

### 5. 技术实现

关键实现仍为：

- `apps/api/src/routes/files.routes.ts`
- `apps/api/src/routes/jobs.routes.ts`
- `apps/api/src/routes/results.routes.ts`
- `apps/api/src/routes/feedback.routes.ts`
- `apps/api/src/routes/evaluation.routes.ts`
- `apps/api/src/routes/route-service-contracts.test.ts`
- `apps/api/src/routes/base.routes.test.ts`
- `apps/api/src/routes/evaluation.routes.test.ts`
- `apps/api/src/demo-services.ts`
- `apps/api/src/services/api-services.ts`

本报告补齐只更新文档结构，不新增业务代码。补齐原因是后续产品审计要求修复/交接报告必须包含 7 个维度，不能只列 TDD、文件和命令。

### 6. 问题清单（P0/P1/P2）

P0：

- 未发现当前 build、全量测试、9901 首页或 `/api/health` 阻断级本地 P0。

P1 已闭环：

- files/jobs/feedback/results/evaluation route-facing response 不再接受 scalar 成功响应。
- Results route service 返回边界从 `unknown | null` 收紧为 object-or-null。

P1 remaining/blocked：

- 真实 OCR/LLM/LIMS sandbox 未通过。
- 真实 LIMS 写回 sandbox 未通过 `writeback-readyFields-only-smoke`。
- 真实 KMS/Vault/Secret Manager 未完成 secret resolution 和 redaction smoke。

P2 已闭环：

- route service 编译期 guard 与 runtime unsafe-cast service response guard 已覆盖本轮路由。
- deployment readiness 可继续区分本地通过与外部 blocked，`exit code 2` 代表外部条件 blocked，不代表本地测试失败。

P2 remaining/blocked：

- 生产多实例 session invalidation store 真实双实例 smoke。
- 真实 broker 多 worker lease/retry/dead-letter/heartbeat/status-result consistency/idempotency smoke。
- 慢 provider、真实 LIMS sandbox、真实数据下的端到端 UX 仍需外部环境复核。
- upstream `DEP0040 punycode` warning 仍存在。

### 7. 验收结论

本地 API 契约阶段：通过。此前记录的关键验证包括 route guard 定向测试、API typecheck、根 typecheck、demo-web style/mobile/build、全量测试、9901 首页和 `/api/health`。

真实外部集成：blocked。`readiness:deployment` 和相关 smoke 在缺真实外部条件时预期为 `exit code 2`，只能写 `localReadiness=passed`，不能写外部 passed。

医疗最终产品：blocked。真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session store、真实 broker 多实例 smoke 和真实 production smoke 全部通过前，不能写最终医疗产品通过。
