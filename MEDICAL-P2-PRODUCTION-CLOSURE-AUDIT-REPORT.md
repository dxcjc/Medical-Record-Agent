# Medical P2 Production Closure Audit Report

生成时间：2026-06-09 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台。产品主线覆盖上传、OCR/LLM 编排、Schema 管理、字段证据、人工反馈、Evaluation、LIMS 写回、Provider 运维和审计。

本轮审计聚焦 P2/生产化遗留闭环：前端 bundle warning、生产 secret/queue/smoke 契约、UI reflow regression guard，以及真实外部条件的 blocked 边界。

## 2. 功能完整性

已闭环：

- demo-web build 不再出现 >500 kB JS chunk warning。
- `vendor-arco` 降至约 415.91 kB，且保持单一 Arco chunk。
- 真实浏览器 E2E 通过，覆盖 `/login`、`/`、`/recognition/new`、`/recognition/jobs/demo`、`/providers`、`/writeback`。
- 移动端抽屉、单列布局、44px 触摸区、横滚表格继续有 guard。
- 生产 smoke 缺外部凭据时明确 `external credential blocked`。
- queue contract 支持 in-process 非生产标记、broker 配置完整性校验和 fail-fast。

未完整：

- 真实外部 OCR/LLM/LIMS sandbox smoke 未执行，缺少外部凭据。
- 真实 KMS/Vault/Secret Manager 未接入。
- 多实例持久化可靠队列未接真实 broker。

## 3. 业务流程完整性

本地业务链路：

- demo-web mock-runtime smoke 可验证 dist bundle、API health 和关键路由。
- 浏览器 E2E 可验证桌面/移动页面打开、导航抽屉、截图和关键文案。
- mock-production contract smoke 只能验证本地契约，不代表真实外部 OCR/LLM/LIMS。

生产业务链路：

- `PRODUCTION_SMOKE_MODE=real-sandbox` 需要真实 base URL、账号、密码和 provider/LIMS sandbox。
- 写回 smoke 只能基于本次识别结果中的 `payload.writeback.readyFields` 调用 `/writeback`。
- 无真实外部凭据时只能结论为 blocked，不能写作通过。

## 4. 用户体验

当前 UI 继续保持 Material + Arco Design 企业级风格：

- Primary `#3370FF`、背景 `#F7F8FA`、白色侧栏、active nav pill。
- `DM Sans + Noto Sans SC` 字体。
- 桌面侧栏保留在 grid flow 中，不 fixed 覆盖主内容。
- 移动端抽屉导航、单列布局和 44px 触摸区继续保留。
- 页面头部 actions 在移动端支持横向滚动，表格内容保留横滚和 touch scrolling。

本轮 UI 改动为小范围：移除 NotFound 的 Arco `Result` 以降低 bundle；用现有文字样式替代少量 `Typography`；补移动端 reflow guard。未改变整体视觉体系。

## 5. 技术实现

关键实现：

- `apps/demo-web/src/vendor/arco-on-demand.ts`
  - 构建期 Arco 按需入口，只导出已用组件深入口。

- `apps/demo-web/vite.config.ts`
  - exact alias 到按需入口。
  - 保留单一 `vendor-arco`，不恢复 `vendor-arco-table/form/overlay/input` 等子 chunk。
  - 拆出 `vendor-react`、`vendor-app-runtime`，避免非 Arco runtime 聚合超过 500 kB。
  - 未设置 `chunkSizeWarningLimit`。

- `apps/api/src/bootstrap/production-services.ts`
  - `buildProductionQueueContract()` 与 `assertProductionQueueContract()` 固化可靠队列配置边界。
  - env secret resolver 对空 ref 和缺失 ref 明确失败，不把缺密钥伪装为可用。

- `scripts/production-smoke.ts`
  - 缺真实外部 sandbox 凭据输出 `external credential blocked`。

## 6. P0/P1/P2 问题清单

P0：

- 未发现当前阻断 typecheck、全量测试、demo-web build、demo-web smoke、浏览器 E2E 的 P0。

P1：

- 真实外部 OCR/LLM/LIMS sandbox 未闭环：blocked。
- 真实 KMS/Vault/Secret Manager 未闭环：blocked。
- 多实例持久化可靠队列未接真实 broker：blocked。

P2 已闭环：

- P2 vendor-arco >500 kB warning：已闭环，当前最大 Arco JS chunk 约 415.91 kB。
- P2 chunk 策略 guard：已闭环，不提高 warning limit，不恢复 Arco 子 chunk，真实 build 日志无 500 kB warning/circular warning。
- P2 UI reflow guard：已闭环，移动端横滚、触摸区、表格 scroll、form `min-width: 0` 有测试。
- P2 production smoke/secret/queue contract：已补代码契约和测试。

P2 remaining：

- 真实外部 sandbox 凭据与环境。
- 真实 KMS/Vault/Secret Manager resolver 实现。
- 真实 broker 队列、lease、retry、dead-letter、worker heartbeat 和多实例一致性 smoke。

## 7. 验收结论

验证命令：

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：通过，65 passed、1 skipped；333 passed、1 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，15 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、10 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，无 500 kB chunk warning，无 circular manual chunk warning。
- `corepack pnpm smoke:demo-web`：通过，`mode=mock-runtime`、`browserE2E=not-run`。
- `corepack pnpm e2e:demo-web:browser`：通过，`browserE2E=passed`、`engine=chrome-cdp`。
- 额外 `corepack pnpm smoke:production`：blocked，`external credential blocked`，缺真实外部凭据。

分层结论：

- UI 当前阶段：通过。
- 本轮 P2 生产闭环阶段：阶段通过。可工程化项已闭环；外部依赖项已明确 blocked，不伪造通过。
- 医疗项目最终产品：不通过。真实外部 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、多实例持久化可靠队列仍未完成真实环境闭环。
