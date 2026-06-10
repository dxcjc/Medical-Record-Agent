# Medical P1 Continuation Fix Report

生成时间：2026-06-09 03:33:00 CST / Asia/Shanghai

## 1. 本轮目标

继续推进医疗项目 P1 业务/安全/集成优化闭环，优先修复最新审计报告中可在代码内闭环的 P1：

- P1-1：Evaluation production runner schema resolution 未闭环。
- P1-2：Production smoke 未配置时缺少产品化 blocked/skipped 语义。
- P1-3：生产异步任务队列未完成，需要先给出最小可验收的同步/异步状态语义。

本轮按 brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion 执行。

## 2. 修复内容

### P1-1 Evaluation production runner schema resolution

已修复。

核心变化：

- `apps/api/src/bootstrap/production-services.ts`
  - 扩展生产 schema resolution：优先按 `schemaVersionId` 查询版本，其次按 `schemaKey` 查询 active 版本；只有 `lims-clinical-info` 允许回退内置 schema。
  - `createProductionEvaluationRunner()` 不再固定 `limsClinicalInfoSchema`。
  - Evaluation runner 会把实际解析出的 `schemaKey/schemaVersionId/schemaSource` 写入 evaluation summary 和 metric breakdown。
  - 每个 evaluation 样本创建的 `RecognitionJob` 会写入实际 `schemaKey/schemaVersionId`，并把同一 schema 选择传入 production recognition orchestrator。
  - Evaluation 专用 orchestrator 复用 production schema/provider resolution，但保持 `autoWritebackEnabled=false`。
- `apps/api/src/services/api-services.ts`
  - `createRun()` 保存 `schemaConfig.schemaKey/schemaVersionId`。
  - 有实际 schemaVersionId 时，完成 run 时回填 `EvaluationRun.schemaVersionId`。
- `apps/api/src/routes/evaluation.routes.ts`
  - `POST /evaluations/runs` 支持可选 `schemaVersionId`。
- `apps/api/src/repositories/evaluation.repository.ts`
  - `completeRun()` 支持通过 relation connect 回填 `schemaVersionId`。

测试覆盖：

- `apps/api/src/bootstrap/production-services.test.ts`
  - 新增测试证明生产 evaluation run 指定自定义 schema 后，样本识别任务和结果字段使用目标 schema，不再固定 `clinicalDiagnosis`。
- `apps/api/src/services/api-services.test.ts`
  - 覆盖 `schemaVersionId` 保存和传递给 runner。
- `apps/api/src/routes/evaluation.routes.test.ts`
  - 覆盖 route 层透传 `schemaVersionId`。
- `apps/api/src/repositories/domainRepositories.test.ts`
  - 覆盖 `completeRun()` 回填 schema version relation。

### P1-2 Production smoke blocked 语义

已做代码内产品化处理，但真实外部 smoke 仍因环境未配置而 blocked。

核心变化：

- `scripts/production-smoke.ts`
  - 新增 `ProductionSmokeConfigurationBlockedError`。
  - 新增 `buildProductionSmokeBlockedReport()`。
  - 缺少 `PRODUCTION_SMOKE_BASE_URL`、`PRODUCTION_SMOKE_EMAIL`、`PRODUCTION_SMOKE_PASSWORD` 时输出：
    `BLOCKED configuration ... 真实外部 API/OCR/LLM/LIMS smoke 未执行。`
  - CLI 缺配置时返回 exit code `2`，区别于真实 smoke 执行失败的 exit code `1`。
  - 写回 smoke 仍会先检查识别结果中存在 `readyFields`，但调用 `/writeback` 时不再透传 fields，只提交 `jobId + confirmed + idempotencyKey`。
- `scripts/production-smoke.test.ts`
  - 覆盖缺环境变量时 blocked report。
  - 覆盖写回 smoke 不再把客户端 fields 透传给服务端。

### P1-3 生产异步任务队列最小闭环

已完成最小产品化改进；完整 worker/queue 仍保留为 P1 remaining。

核心变化：

- `apps/api/src/services/api-services.ts`
  - `jobService.create()` 返回 `executionMode: "synchronous"`。
  - 返回 `statusSemantics`，明确当前 `queued/running` 是同步 inline orchestrator 的状态流转记录，不代表后台队列已完整实现。
  - `POST /jobs` 支持可选 `schemaVersionId` 并传入生产 schema resolver。
- `apps/demo-web/src/api/types.ts`
  - 前端 API 类型补齐 `schemaVersionId`、`executionMode`、`statusSemantics`。

未实现完整队列的原因：

- 当前生产识别仍在 `POST /jobs` 请求内同步等待 OCR/LLM/core orchestrator。
- 在没有现成 worker、broker、重试、幂等消费、失败恢复和状态轮询契约的前提下，直接引入队列会扩大风险。
- 下一轮应独立实现 `POST /jobs` 入队、worker 消费、状态轮询/订阅、超时和重试语义。

## 3. 主要文件

- `apps/api/src/bootstrap/production-services.ts`
- `apps/api/src/bootstrap/production-services.test.ts`
- `apps/api/src/services/api-services.ts`
- `apps/api/src/services/api-services.test.ts`
- `apps/api/src/routes/evaluation.routes.ts`
- `apps/api/src/routes/evaluation.routes.test.ts`
- `apps/api/src/repositories/evaluation.repository.ts`
- `apps/api/src/repositories/domainRepositories.test.ts`
- `apps/demo-web/src/api/types.ts`
- `scripts/production-smoke.ts`
- `scripts/production-smoke.test.ts`

## 4. 验证结果

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm exec vitest run apps/api/src/repositories/domainRepositories.test.ts apps/api/src/services/api-services.test.ts apps/api/src/bootstrap/production-services.test.ts apps/api/src/routes/evaluation.routes.test.ts` | 通过。4 files passed，46 tests passed。 |
| `corepack pnpm exec vitest run apps/api/src/services/api-services.test.ts apps/api/src/bootstrap/production-services.test.ts scripts/production-smoke.test.ts` | 通过。3 files passed，39 tests passed。 |
| `corepack pnpm typecheck` | 通过。shared/core/demo-web/api typecheck 均通过。 |
| `corepack pnpm test` | 通过。62 passed、1 skipped；293 passed、1 skipped。运行中有 Node `punycode` deprecation warning。 |
| `corepack pnpm --filter @medical-record-agent/demo-web build` | 通过。无 500k JS chunk 警告；仍有 Arco manualChunks circular chunk 提示。 |
| `corepack pnpm smoke:production` | BLOCKED，exit code 2。缺少 `PRODUCTION_SMOKE_BASE_URL`、`PRODUCTION_SMOKE_EMAIL`、`PRODUCTION_SMOKE_PASSWORD`；真实外部 API/OCR/LLM/LIMS smoke 未执行。 |

## 5. 未完成项

- 真实 production smoke 未通过：需要配置 `PRODUCTION_SMOKE_BASE_URL`、测试账号、真实/sandbox OCR、LLM、LIMS 环境变量和外部 sandbox 后才能判定通过。
- 完整生产异步任务队列未实现：本轮只补齐同步执行模式和状态语义，worker/queue/重试/轮询仍是 P1 remaining。
- Provider secretRefs 真实密钥库、浏览器 E2E、安全基线仍按既有审计列为后续项。

## 6. 结论

本轮 P1 可代码闭环项阶段通过：Evaluation runner schema resolution 已闭环，production smoke 缺配置具备 blocked 语义，生产任务创建已明确同步执行模式。

医疗项目最终产品验收仍不通过：真实外部 OCR/LLM/LIMS smoke 未配置执行，完整异步任务队列仍未落地。
