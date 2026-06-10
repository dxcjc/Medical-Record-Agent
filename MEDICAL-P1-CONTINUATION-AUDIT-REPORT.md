# Medical P1 Continuation Audit Report

生成时间：2026-06-09 03:33:00 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向医疗病历图片、PDF、扫描件和 OCR 文本的结构化识别与治理工作台。产品围绕 Schema 版本、Provider 配置、LangGraph 识别编排、字段证据、人工复核、Evaluation 和 LIMS 写回，提供可配置、可审计的医疗数据处理链路。

目标用户：

- 临床数据录入与复核人员：上传病历、查看字段候选、证据、置信度并提交反馈。
- LIMS/医疗检验运维人员：维护 Provider、Schema、写回策略和审计日志。
- 数据科学与评测人员：导入脱敏评估集、运行字段级评估、比较模型与 Schema 版本。
- 系统管理员和安全负责人：管理权限、审计高风险操作、控制真实 OCR/LLM/LIMS 集成。

核心价值：

- 将非结构化病历转为结构化字段候选，并保留证据链和置信度。
- 通过 Schema 版本化降低字段变更和写回映射风险。
- 通过 Evaluation 验证模型、Provider、Schema 变更效果。
- 通过权限、审计、幂等、二次确认约束 LIMS 写回等高风险动作。

## 2. 功能完整性

页面和 API 主体仍保持上一轮状态：登录、识别、任务详情、Schema Studio、Evaluation、Feedback、Provider、Writeback、Trace、Audit、Dataset Spec 均有页面和 API 承载。

本轮功能完整性变化：

- Evaluation run 创建现在可携带 `schemaVersionId`，生产 runner 会按 `schemaVersionId/schemaKey` 解析目标 schema。
- Evaluation 样本识别任务会写入实际 `schemaKey/schemaVersionId`，RecognitionResult 和 evaluation metrics 能反映实际 schema。
- Production smoke 缺配置时有明确 `BLOCKED configuration` 输出和 exit code 2，不再只有普通失败异常。
- Job 创建响应包含 `executionMode: "synchronous"` 和状态语义说明，避免调用方误以为 queued/running 已代表完整后台队列。

仍未完整：

- 真实外部 OCR/LLM/LIMS production smoke 未配置执行。
- 完整生产异步任务队列和 worker 未落地。

## 3. 业务流程完整性

识别流程：

- 生产 `POST /jobs` 仍同步执行 OCR/LLM/core orchestrator 并落库 RecognitionResult。
- 本轮新增同步模式显式返回，调用方能看到当前是 inline synchronous，而不是完整异步队列。
- `schemaVersionId` 可进入生产识别 schema resolver，避免版本选择只停留在前端或 JSON 配置。

Evaluation 流程：

- 创建 run 时保存 `schemaConfig.schemaKey/schemaVersionId`。
- 生产 runner 按版本或 active schema 解析目标 schema。
- 每个样本识别任务使用同一目标 schema，并写入 RecognitionJob。
- evaluation summary、metric breakdown 和 `EvaluationRun.schemaVersionId` 可反映实际 schema 版本。

Production smoke 流程：

- 缺少必须环境变量时输出 blocked，并明确真实外部 API/OCR/LLM/LIMS 未执行。
- 写回 smoke 不再把客户端 fields 传给服务端执行；服务端写回可信边界仍由后端 result readyFields 决定。

写回流程：

- 延续上一轮修复：手动写回执行数据来自服务端持久化 RecognitionResult.readyFields。
- 本轮 smoke 脚本也对齐该契约，不再传客户端 fields。

## 4. 用户体验

本轮未大改 UI。主要 UX 影响在 API 语义和运维反馈：

- Production smoke 的未配置状态从普通失败变为明确 blocked，便于 CI、报告和运维区分“环境未准备”和“真实 smoke 失败”。
- Job 创建响应增加同步模式和状态语义，有助于前端或集成方展示真实等待/轮询预期。
- demo-web build 仍保持通过，无 500k JS chunk 警告；构建中仍有 Arco manualChunks circular chunk 提示，属于后续打包优化项。

用户体验剩余风险：

- 真实慢 OCR/LLM 场景下，`POST /jobs` 同步等待仍可能造成请求超时或长时间 loading。
- 缺少真实浏览器 E2E 和外部 sandbox smoke，不能证明生产端到端交互完全可用。

## 5. 技术实现

关键实现：

- `apps/api/src/bootstrap/production-services.ts`
  - 抽出可复用 production schema resolution。
  - 支持 `schemaVersionId` 优先、`schemaKey` active 版本次之、内置 LIMS schema 仅作兼容回退。
  - Evaluation runner 和 recognition orchestrator 共享 schema/provider resolution。
- `apps/api/src/services/api-services.ts`
  - `createRun()` 保存 schema 配置并在完成 run 时回填实际 schemaVersionId。
  - `jobService.create()` 返回同步执行模式和状态语义。
- `apps/api/src/repositories/evaluation.repository.ts`
  - `completeRun()` 支持连接 SchemaVersion relation。
- `scripts/production-smoke.ts`
  - 增加 blocked report、blocked error、exit code 2。
  - 写回 smoke 调整为服务端可信数据契约。

测试与验证：

- 新增/更新 API service、production bootstrap、evaluation routes、domain repository、production smoke tests。
- `corepack pnpm typecheck` 通过。
- `corepack pnpm test` 通过。
- demo-web build 通过。

## 6. P0/P1/P2 问题清单

### P0

未发现当前阻断构建或全量测试的 P0。

### P1 已修或阶段闭环

- P1-1 Evaluation production runner schema resolution：已修。生产 runner 不再固定 LIMS 内置 schema，支持 `schemaVersionId/schemaKey` 解析，样本任务和 metrics 记录实际 schema。
- P1-2 Production smoke 未配置语义：已修代码语义。缺配置时明确 blocked，exit code 2，不伪造通过。
- P1-3 生产任务同步/异步语义：已做最小闭环。Job 创建响应明确 `executionMode: "synchronous"` 和状态语义。

### P1 Remaining

- 真实 production smoke 环境未配置：缺少 `PRODUCTION_SMOKE_BASE_URL`、`PRODUCTION_SMOKE_EMAIL`、`PRODUCTION_SMOKE_PASSWORD`，真实外部 OCR/LLM/LIMS sandbox 未执行，不能判定外部集成通过。
- 完整生产异步任务队列未实现：仍需 worker、队列/broker、超时、重试、幂等消费、失败恢复、状态轮询或订阅。

### P2

- Provider secretRefs 尚未接入真实 KMS/Vault/Secret Manager。
- 缺少真实浏览器 E2E 和移动端截图验收。
- 安全基线仍可继续增强：CSP、rate limit、HttpOnly cookie/session 轮换、登出失效等。
- demo-web build 仍有 Arco manualChunks circular chunk 提示，可后续优化。

## 7. 验收结论

本轮 P1 可代码闭环项：通过。

依据：

- Evaluation production runner schema resolution 已通过测试证明，不再固定内置 LIMS schema。
- Production smoke 缺配置时输出 blocked，不伪造外部环境通过。
- 生产任务创建已显式声明同步执行模式，避免 queued/running 语义误导。
- `corepack pnpm test` 通过：62 passed、1 skipped；293 passed、1 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build` 通过：无 500k JS chunk 警告。
- `corepack pnpm typecheck` 通过。

医疗项目最终产品验收：不通过。

原因：

- `corepack pnpm smoke:production` 当前为 BLOCKED，exit code 2；真实外部 API/OCR/LLM/LIMS 未执行。
- 完整生产异步任务队列仍未实现。
- 密钥库、真实浏览器 E2E、生产安全基线仍有未闭环项。

下一轮明确任务：

1. 配置 production smoke sandbox：API base URL、测试账号、OCR/LLM/LIMS sandbox 和必要 secrets。
2. 实现生产 job queue/worker：`POST /jobs` 入队返回，worker 异步执行，前端轮询/订阅状态。
3. 接入 Provider secretRefs 到真实密钥库，并补外部 provider health/smoke。
