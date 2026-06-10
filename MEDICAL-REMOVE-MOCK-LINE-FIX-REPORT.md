# Medical Remove Mock Line Fix Report

Date: 2026-06-09

## Scope

本轮继续上一轮 `remove mock line` 半成品，按 superpowers 流程完成：brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion。已先检查当前 git diff 和 `.codex-remove-mock-line-task.log`，保留上一轮已有改动，只补剩余项、测试和报告。

## Changes

- AppShell 顶部状态：不再显示 `Mock Provider Ready`；只有开发占位 provider 时显示“开发占位，不可用于真实识别”，真实 OCR+LLM 均启用时显示“Provider 已连接”。
- 新建识别：Provider 下拉过滤 `isMock`、`development_placeholder`、`mock-*` 等开发占位；没有真实 OCR/LLM provider 时禁用“开始识别”和“合成样本”，提示先到 Provider 设置配置真实 Provider。
- Provider 设置页：普通用户可选 Provider 类型只保留 HTTP OCR、LangChain、OpenAI-compatible、OpenAI Responses、Object Storage、LIMS REST；健康检查匹配会跳过 mock/disabled/development_placeholder provider。
- API provider：demo/production fallback mock 保留为内部能力，但统一输出 `isMock: true`、`enabled: false`、`isDefault: false`、`status: development_placeholder`；开发占位 provider health 返回 blocked，不能设为默认。
- 文档和用户可见说明：README 新增真实操作路径；Dataset 规范页把 mock provider 改为“开发占位 provider”，明确只用于 CI/公开演示边界，不作为真实操作路径。
- 测试/构建修复：补齐 AppShell、NewRecognition、ProviderSettings、API provider、demo provider health、production provider health/default、Evaluation provider fixture、normalizer exact optional type、readiness contract 等回归点。

## Verification

- Passed: `corepack pnpm --filter @medical-record-agent/demo-web test:styles`
- Passed: `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`
- Passed: `corepack pnpm --filter @medical-record-agent/demo-web build`
- Passed: `corepack pnpm exec vitest run apps/demo-web/src/pages/recognition/NewRecognitionPage.test.ts apps/demo-web/src/layouts/AppShell.test.ts apps/demo-web/src/pages/operations/ProviderSettingsPage.test.ts apps/demo-web/src/pages/evaluation/EvaluationPage.test.ts`
- Passed: `corepack pnpm exec vitest run apps/api/src/routes/providers.routes.test.ts apps/api/src/bootstrap/production-services.test.ts apps/api/src/demo-services.test.ts apps/api/src/services/api-services.test.ts`
- Passed: `corepack pnpm test` (`68 passed | 1 skipped`, `395 passed | 1 skipped`)
- Passed: `corepack pnpm smoke:demo-web`
- Passed: `curl http://127.0.0.1:9901/` returned 200; `Last-Modified: Tue, 09 Jun 2026 06:42:34 GMT` check observed current build assets after rebuild.
- Passed: `curl http://127.0.0.1:9901/api/health` returned 200 with `{"status":"ok","service":"medical-record-agent-api"}`.

## Result

去 mock 用户主线阶段通过。内部测试/CI mock 仍可用，但已标识为开发占位，不作为真实用户操作路径。真实外部 OCR/LLM/LIMS 待配置；UI 不再误导为 mock ready。
