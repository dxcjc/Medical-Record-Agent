# Medical P1/P2 Next Audit Report

生成时间：2026-06-09 04:31:34 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向医疗病历图片、PDF、扫描件和 OCR 文本的结构化识别与治理工作台。产品覆盖文件上传、异步识别任务、Schema 版本、Provider 配置、OCR/LLM 编排、字段证据、人工复核、Evaluation、LIMS 写回和审计。

目标用户包括临床数据录入/复核人员、LIMS 运维人员、模型评测人员和安全管理员。核心价值是把非结构化病历转为可追溯、可验证、可写回的结构化字段，同时保留证据链、Schema 版本和高风险操作审计。

## 2. 功能完整性

本轮新增或完善：

- `POST /jobs` 默认进入异步队列，返回 queued 状态和轮询 URL。
- 后台执行器真实调用 OCR/LLM/core orchestrator，成功写入 RecognitionResult，失败写入 failed/error。
- `GET /jobs/:id` 可用于轮询任务状态。
- Production smoke 支持 blocked、mock-production、real-sandbox 三态。
- Provider `secretRefs` 接入 resolver，保存 provider 的密钥引用会被解析并进入真实 HTTP OCR/LLM runtime。

仍未完整：

- 真实 sandbox 外部 OCR/LLM/LIMS 未配置，真实 production smoke 仍 blocked。
- 当前队列是进程内最小闭环，尚不是跨进程持久化 worker/broker。
- 真实 KMS/Vault/Secret Manager 未接入。

## 3. 业务流程完整性

识别流程：

- 调用方创建任务后立即得到 `queued/asynchronous` 响应。
- 后台执行器将任务推进到 `running`，调用编排链路，最终写入 completed/needs_review/partial_completed/writeback_completed/writeback_failed/failed 等 terminal 状态。
- 调用方可轮询 `/jobs/:id`，并在 terminal 后读取 `/results/:jobId`。
- 同步模式仍可通过 service 构造选项显式启用，用于测试或兼容场景。

Smoke 流程：

- 缺少真实环境变量时明确 blocked，不执行真实外部 API/OCR/LLM/LIMS。
- mock-production contract smoke 可在本地跑通受控链路。
- real-sandbox 语义保留给真实外部环境验证。

Provider 流程：

- 在线保存 provider 时仍只持久化 `secretRefs`，API 响应继续脱敏。
- 运行时通过 resolver 解析 `secretRefs.apiKey`，再注入 HTTP OCR/LLM 请求。
- resolver 缺失 secret 时 provider 不可用，不静默回退默认 provider。

## 4. 用户体验

正向变化：

- 任务创建 API 不再长时间阻塞，前端和集成方可以展示 queued/running/terminal 状态。
- smoke 输出包含 `MODE blocked/mock-production/real-sandbox`，运维能区分未配置、mock 合同通过和真实 sandbox。
- Provider 配置能继续展示 secretRefs 配置状态，不暴露明文密钥。

剩余 UX 风险：

- 前端页面如果仍按同步完成假设展示结果，需要继续优化轮询、进度和失败提示。
- 真实慢 OCR/LLM 的任务超时、重试、取消和队列积压可视化仍不足。

## 5. 技术实现

关键实现文件：

- `apps/api/src/services/api-services.ts`
  - `createInProcessJobQueueExecutor()`。
  - 默认异步 `jobService.create()`。
  - 后台执行成功/失败状态持久化。
- `apps/api/src/bootstrap/production-services.ts`
  - `SecretResolver`、`createEnvSecretResolver()`、`createMockSecretResolver()`。
  - 保存的 HTTP OCR/LLM provider 接入 secretRefs resolver。
- `scripts/production-smoke.ts`
  - smoke 三态。
  - job 状态轮询。
  - mock-production contract smoke。
- `README.md`、`.env.example`
  - smoke 三态和轮询配置说明。

测试覆盖：

- service 层覆盖入队、执行、失败、状态语义。
- production bootstrap 覆盖异步 drain、secret resolver、HTTP OCR/LLM secret 注入。
- production smoke 覆盖 blocked、mock-production、real-sandbox 轮询语义。

## 6. P0/P1/P2 问题清单

### P0

未发现当前阻断 typecheck、测试或 demo-web build 的 P0。

### P1 本轮已闭环

- P1-1 生产异步任务队列未实现：已完成最小可验收闭环。
- P1-2 production smoke 真实环境 blocked 语义不清：已完成三态区分，并新增 mock-production contract smoke。
- P1-3 Provider secretRefs 未接入运行时密钥解析：已完成可插拔 resolver 和 HTTP OCR/LLM 接入测试。

### P1 Remaining

- 真实 production sandbox 仍未配置，外部 OCR/LLM/LIMS 真实 smoke 仍 blocked。
- 进程内队列不满足多实例生产部署的可靠队列要求，后续需要持久化 broker、lease、重试、死信、监控和幂等消费。

### P2

- 接入真实 KMS/Vault/Secret Manager。
- 前端轮询、取消、重试、队列进度和失败详情继续增强。
- 真实浏览器 E2E 和移动端截图验收仍需补齐。
- demo-web Arco manualChunks circular chunk 提示仍需打包优化。
- 安全基线继续增强：CSP、rate limit、HttpOnly cookie/session 轮换、登出失效等。

## 7. 验收结论

本轮 P1 阶段验收：通过。

依据：

- `corepack pnpm typecheck` 通过。
- `corepack pnpm test` 通过：62 passed、1 skipped；301 passed、1 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build` 通过。
- `PRODUCTION_SMOKE_MODE=mock-production PRODUCTION_SMOKE_RUN_WRITEBACK=1 corepack pnpm smoke:production` 通过。
- 真实缺配置 smoke 输出 `MODE blocked`，exit code 2，未伪造通过。
- 代码搜索确认异步队列、secret resolver、smoke 三态均真实落地。

医疗项目最终产品验收：不通过。

原因：

- 真实外部 sandbox 环境未配置，真实 API/OCR/LLM/LIMS 未完成 production smoke。
- 队列仍是进程内最小闭环，尚未达到多副本生产 worker/broker 可靠性。
- 真实 KMS/Vault/Secret Manager、完整生产安全基线和真实 E2E 验收仍未闭环。
