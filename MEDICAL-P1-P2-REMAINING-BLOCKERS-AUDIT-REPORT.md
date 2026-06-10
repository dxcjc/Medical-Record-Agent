# Medical P1/P2 Remaining Blockers Audit Report

生成时间：2026-06-10 01:32:59 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台，覆盖上传、OCR/LLM 编排、Schema、证据、人工反馈、Evaluation、LIMS 写回、Provider 运维、安全审计和生产 readiness。

本轮审计不把 UI 当前阶段通过误判为医疗最终完成；重点是 remaining/blocked 中可本地落地的 readiness gate、contract test、配置校验、smoke harness 和交接文档。

## 2. 功能完整性

本轮新增本地闭环能力：

- Queue broker readiness：本地 in-process queue、Redis skeleton queue、status/result consistency 有独立 CLI 和测试。
- Deployment readiness gate：新增 `queue-broker-readiness` 检查，能把本地队列 contract 通过与真实 broker blocked 分开。
- Production smoke：queue blocked 文案和 required checks 与 readiness/handoff 对齐。
- Punycode diagnostic：明确当前 warning 来源和处理边界。
- Browser E2E harness：本地浏览器验收不再受 Google Fonts 外部网络和 `document.readyState` 偶发影响，仍保持原有 Material + Arco UI。

仍未完整：

- 真实 OCR/LLM/LIMS sandbox。
- 真实 KMS/Vault/Secret Manager。
- 生产多实例 session invalidation store。
- 真实 Redis/RabbitMQ/SQS broker 多实例队列。
- 外部慢 provider 下队列积压、重试、失败可视化。

## 3. 业务流程完整性

本地/契约层流程继续推进：

上传/创建 job -> 队列 contract 接收任务 -> lease/retry/dead-letter/heartbeat/idempotency 本地 skeleton 校验 -> job status/result consistency 本地 harness 校验 -> production smoke/readiness 输出 blocked 条件。

真实生产流程仍 blocked：没有真实 broker 和多 worker 环境时，不能证明跨实例 lease 排他、心跳恢复、死信处理、重复 idempotency key 去重、慢 provider 积压和失败可视化。

## 4. 用户体验

本轮未改 UI CSS，保持现有 Material + Arco Design。用户体验收益集中在运维/部署诊断：

- `readiness:queue-broker` 给出机器可读 `SUMMARY_JSON` 和明确 blocked step。
- `readiness:deployment` 能收集 queue readiness blocked diagnostic。
- punycode warning 被准确归因，避免误导为业务代码安全问题或随意修改 `node_modules`。

## 5. 技术实现

关键文件：

- `scripts/queue-broker-readiness.ts`
- `scripts/queue-broker-readiness.test.ts`
- `scripts/punycode-deprecation-diagnostic.ts`
- `scripts/punycode-deprecation-diagnostic.test.ts`
- `scripts/deployment-readiness-gate.ts`
- `scripts/deployment-readiness-gate.test.ts`
- `scripts/production-smoke.ts`
- `scripts/demo-web-browser-e2e.ts`
- `apps/api/src/services/api-services.ts`
- `apps/api/src/bootstrap/production-services.ts`
- `docs/2026-06-09-p2-production-handoff.md`

技术判断：本轮是 local readiness/contract hardening，不接入真实外部 SDK，不把 skeleton 标记 productionReady。

## 6. P0/P1/P2 问题清单

P0：

- 当前未发现本轮新增阻断级 P0。

P1 已推进：

- Production smoke 和 deployment readiness 对真实外部 blocked 的报告更清晰。
- Queue requiredChecks 统一，避免 handoff、smoke、status 描述漂移。
- Punycode warning 来源明确，不再笼统记录。
- Browser E2E 本地 harness 偶发超时已收敛，验证仍只代表本地浏览器/布局，不代表真实 OCR/LLM/LIMS。

P1 still blocked：

- 真实 OCR/LLM/LIMS sandbox smoke 未通过。
- 真实 production smoke 未通过。

P2 已推进：

- 本地 queue broker readiness harness。
- Redis broker skeleton contract 的 dead-letter 脱敏 guard。
- Status/result consistency 本地 contract。
- Deployment gate 纳入 queue readiness。
- Browser E2E readiness 改为 SPA root 渲染条件，并在 harness 内阻断 Google Fonts 外部请求。

P2 still blocked：

- 真实 KMS/Vault/Secret Manager。
- 生产多实例 session invalidation store。
- 真实 broker 多实例 lease/retry/dead-letter/heartbeat/status-result consistency/idempotency smoke。
- 外部慢 provider 下队列积压、重试、失败可视化。
- `DEP0040 punycode` upstream dependency warning。

## 7. 验收结论

当前结论：

- 本地可闭环 P1/P2 子项：阶段通过。
- 真实外部集成：blocked。
- 医疗最终产品：blocked。

最终验证：

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，19 tests passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed / 14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，入口 `/assets/index-BI5ExnF3.js`，最大 JS chunk 415.91 kB，无 500 kB JS warning。
- `corepack pnpm test`：通过，75 passed / 1 skipped files；431 passed / 1 skipped tests；存在 upstream `DEP0040 punycode` warning。
- `corepack pnpm readiness:queue-broker`：exit code 2，local readiness passed，真实 broker smoke blocked。
- `corepack pnpm e2e:demo-web:browser`：通过，Chrome CDP，桌面/移动 6 路由。
- `corepack pnpm readiness:deployment`：exit code 2，`localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`。
- `corepack pnpm smoke:production`：exit code 2，`STATUS blocked`。
- 9901 `/`：200 OK，且 HTML 引用 `/assets/index-BI5ExnF3.js`。
- 9901 `/api/health`：200 OK。
- `apps/demo-web/dist/index.html` 与 9901 HTML 均引用 `/assets/index-BI5ExnF3.js`。

真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、真实 broker 多实例 smoke 未跑通前，不能写医疗项目最终完成。
