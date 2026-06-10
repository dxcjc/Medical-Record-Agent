# Medical P2 Async Handoff Audit Report

生成时间：2026-06-09 23:21:13 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台。核心链路覆盖上传、OCR/LLM 编排、Schema 管理、字段证据、人工反馈、Evaluation、Provider 运维、LIMS 写回和审计。

本轮审计聚焦不依赖外部真实凭据的 P1/P2 本地闭环：关键异步操作的取消、队列提示、处理中提示、失败恢复和重试能力。审计边界明确：前端异步 UX 阶段通过不等于真实 OCR/LLM/LIMS、真实 KMS、真实 broker 或医疗最终产品通过。

## 2. 功能完整性

已补齐：

- 新建识别任务可显示 queued/running/completed/failed 的细粒度状态。
- 识别进度可展示队列位置、队列深度、建议重试时间、worker、attempt 和 heartbeat。
- Evaluation run 和样本导入可区分提交中、取消、失败、成功，并提示是否可取消或重试。
- Evaluation run 列表支持 `已失败` 状态，并给出重试建议。
- 写回执行可在 running/cancelled/failed/succeeded 下给出恢复提示。
- Provider 保存和 Health Check 支持取消当前操作和重试上次操作。
- Schema validate/publish/compare/deactivate/rollback 支持取消当前请求和重试上次操作，发布/停用/回滚仍需要二次确认。
- API client 对这些长操作透传 `AbortSignal`，没有改变业务 payload。

未补齐：

- 真实 OCR/LLM/LIMS sandbox 未接入。
- 真实 KMS/Vault/Secret Manager 未接入。
- 生产多实例 session store smoke 未完成。
- 真实 broker 多实例可靠队列 smoke 未完成。

## 3. 业务流程完整性

本地可闭环流程：

- 识别：上传/创建 job -> queued/running 轮询 -> terminal 读取结果 -> 失败/取消后可重跑上一次配置。
- Evaluation：选择 dataset/schema/provider -> 创建 run -> 队列等待或处理中提示 -> 失败后可重跑；样本导入同样支持取消和重跑。
- 写回：真实候选或手动 job -> 二次确认 -> 写回执行中可取消 -> 失败/取消后恢复原任务状态并可重跑。
- Provider：保存配置或 Health Check -> 处理中可取消 -> 失败后重试上次操作。
- Schema：验证、比较、发布、停用、回滚 -> 请求可取消 -> 失败后可重试；危险操作仍保留确认弹窗。

仍未闭环的真实生产流程：

- 慢 OCR/LLM provider、真实 LIMS 写回失败/重试、真实 broker worker lease/retry/dead-letter/heartbeat/status-result consistency 需要外部环境验证。
- 多实例 session store 和真实密钥库需要真实共享服务与 smoke。

## 4. 用户体验

本轮没有粗暴重写 CSS，没有改变现有 Material + Arco Design 体系：

- Primary `#3370FF`、背景 `#F7F8FA`、白色侧栏、active nav pill、`DM Sans + Noto Sans SC` 继续由 guard 覆盖。
- 页面仍使用 Arco `Card`、`Alert`、`Button`、`Tag`、`Progress` 和既有 `operations-status-strip`。
- 移动端 guard 继续通过，保留抽屉/单列/44px 触摸区。

用户侧收益：

- 长任务不再只有粗粒度 loading，可看到排队、处理中、worker、失败和恢复动作。
- 取消和重试按钮有更明确的状态边界。
- 失败不会被静态演示数据伪装为成功，也不会把外部 blocked 改写成 passed。

## 5. 技术实现

关键实现：

- `apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx`
  - `describeRecognitionAsyncProgress()` 增加队列/worker/重试/恢复字段。
  - `getRecognitionAsyncRecoveryHint()` 输出 UI 操作提示。

- `apps/demo-web/src/pages/evaluation/EvaluationPage.tsx`
  - `describeEvaluationMutationState()` 和 `describeEvaluationRunQueueState()`。

- `apps/demo-web/src/pages/operations/WritebackPage.tsx`
  - `describeWritebackExecutionState()`。

- `apps/demo-web/src/pages/operations/ProviderSettingsPage.tsx`
  - `describeProviderAsyncAction()`。
  - 保存与 Health Check 使用 AbortController。

- `apps/demo-web/src/pages/schema/SchemaStudioPage.tsx`
  - `describeSchemaActionRecovery()`。
  - Schema 变更请求使用 AbortController，重试危险操作时回到确认弹窗。

- `apps/demo-web/src/api/client.ts`
  - 为 Schema、Provider、eligible writeback 等长操作补 `signal` 透传。

测试覆盖：

- 页面 helper 单测覆盖队列、worker、取消、失败、重试和恢复文案。
- API client 单测覆盖长操作 `AbortSignal` 透传。
- 样式/mobile/build/full test 全部通过。

## 6. P0/P1/P2 问题清单

P0：

- 未发现当前阻断 demo-web build、样式/mobile guard、全量测试、9901 首页或 `/api/health` 的 P0。

P1 已闭环：

- 关键异步操作失败后有明确恢复路径，不再只有泛化错误。
- 写回重试仍保持服务端可信边界，前端不提交 fields/payload。
- Schema 危险操作重试仍走二次确认，不绕过生产变更门禁。

P1 remaining/blocked：

- 真实 OCR/LLM/LIMS sandbox 未完成真实 smoke。
- 真实 production smoke 仍依赖外部 sandbox 和凭据。

P2 已闭环：

- 识别任务队列积压/处理中提示。
- Evaluation run/import 取消、重试和队列状态提示。
- Provider 保存/Health Check 取消、重试和失败恢复。
- Schema 异步操作取消、重试和恢复提示。
- API client 长操作 signal contract。

P2 remaining/blocked：

- 真实 KMS/Vault/Secret Manager。
- 生产多实例 session store。
- 真实 broker 多实例可靠队列。
- 慢 provider 和真实 LIMS sandbox 的浏览器端到端体验验证。

## 7. 验收结论

验证命令：

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，19 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，入口 `/assets/index-BI5ExnF3.js`。
- `corepack pnpm test`：通过，73 passed、1 skipped；421 passed、1 skipped。存在既有 Node `DEP0040 punycode` warning。
- 9901 `/`：200 OK。
- 9901 `/api/health`：200 OK。
- `dist/index.html` 与 9901 首页均引用 `/assets/index-BI5ExnF3.js`。

分层结论：

- UI 当前阶段：通过。
- P1-P2 本轮阶段：通过，异步长任务 UX 与本地 handoff 状态已补强。
- 真实外部集成：blocked。
- 医疗最终产品：不通过/blocked。真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session store、真实 broker 多实例可靠队列全部通过前，不能写最终产品通过。
