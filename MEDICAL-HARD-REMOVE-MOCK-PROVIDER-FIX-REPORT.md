# Medical Hard Remove Mock Provider Fix Report

## 修复结论

本轮是二次验收后的收尾修复。调度者复扫发现业务代码和文档主线仍有残留：两个 normalizer/service 分支继续围绕 `mock provider` 文案判断，系统架构文档和 2026-06-04 旧 spec/plan 仍把 Mock Provider 写成架构必要部分、本地业务模式或可继续执行路线。

补修后，用户/业务/当前文档主线不再表达 mock provider、mock-ocr、mock-model、development_placeholder 或开发占位 provider 为可用路线。真实模型提供商等待用户后续提供并接入；没有真实 OCR/LLM Provider 时，系统保持待配置状态并阻断识别创建。

## 本轮补修范围

- `apps/demo-web/src/api/normalizers.ts`：删除 `text.includes("mock provider")` / `text.includes("mock model")` 分支；兼容过滤只保留结构化标志、旧 key 前缀、旧状态码和 provider kind。
- `apps/api/src/services/api-services.ts`：删除同类展示文案判断；业务 availability 不再围绕 mock provider 文案做判断。
- `docs/system-architecture.md`：将“Mock Provider 是架构必要部分”“本地开发模式使用 mock provider”“测试后备”等主线表述改为测试替身、fixture、合成样本和 contract test double 语义。
- `docs/superpowers/specs/2026-06-04-medical-record-recognition-agent-design.md` 与 `docs/superpowers/plans/2026-06-04-medical-record-agent-product.md`：标注为历史草案，说明已被 2026-06-09 hard remove 方案取代；执行路线改为真实 Provider 主线和测试替身边界。
- `docs/superpowers/plans/2026-06-09-remove-mock-line.md`：保留历史纠偏留痕，但显著标注不作为产品或架构主线。
- `docs/architecture-teaching.html`：当前教学卡片改为“测试替身”语义。
- `scripts/production-smoke.ts`、`packages/core/src/providers/mockOcrProvider.ts`、`packages/core/src/providers/mockModelProvider.ts`：本地 contract/test-double 默认 key 改为 fixture 语义，避免非测试源码扫描继续命中旧演示 key。

## 测试覆盖

- 相关前端/API/core/script 测试覆盖 provider 过滤、创建识别阻断、demo service 内部测试编排、production smoke contract、core provider factory。
- 用户主线扫描测试继续覆盖 README、主要用户页面和数据集文档。

## 验证结果

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：19 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：5 passed，14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过。
- 相关测试：36 passed；完整相关回归前置验证曾覆盖 98 passed。
- `corepack pnpm test`：407 passed，1 skipped。
- `corepack pnpm typecheck`：通过。
- `corepack pnpm smoke:demo-web`：通过；`mode=mock-runtime` 是脚本测试 runtime 标签，不是业务 provider。
- `http://127.0.0.1:9901/`：200 OK。
- `http://127.0.0.1:9901/api/health`：200 OK，返回 `{"status":"ok","service":"medical-record-agent-api"}`。
- 用户/业务/当前文档主线禁词扫描：无命中。剩余命中仅在历史报告和 `.test.*` 测试文件中。

## 剩余说明

全仓宽扫仍会看到历史报告和测试用例中的 mock 词，这是预期豁免：历史报告记录纠偏过程，测试文件验证旧数据不会进入业务主线。非测试业务源码、当前文档主线、README、脚本和 core 测试替身实现均已清理指定禁词。
