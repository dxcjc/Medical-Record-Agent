# 2026-06-09 Hard Remove User/Business Simulated Provider Plan

> 本计划按 superpowers 流程执行：brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion。

> 二次验收补充：本文件是历史纠偏留痕，不作为产品或架构主线。当前执行方案是用户/业务主线只接入真实 OCR/LLM Provider；测试边界只允许测试替身、fixture、合成样本和 contract test double。

## Brainstorming

用户纠正上一轮“开发占位提供商”口径仍不符合要求。本轮目标不是重命名旧模拟路线，而是把它从用户/业务主线彻底删除：产品页面、`/providers` 业务返回、Provider 设置、新建识别和 README 操作主线都不再出现模拟模型提供商或开发占位提供商。

内部测试技术 mock、fixtures、`vi.mock`、`fetchMock` 以及 core 层测试替身可以保留，但不得通过业务 API 暴露为用户可选 provider，不得进入前端下拉，也不得写进用户操作主线。真实模型提供商等待用户后续提供并接入；当前没有真实 OCR/LLM provider 时系统应显示“未配置真实 Provider / 等待接入真实模型提供商”，并阻断识别创建。

主要风险面：

- 顶部状态只能展示 `Provider 待配置` 或 `Provider 已连接`，不能出现 mock 或开发占位。
- 新建识别无真实 OCR/LLM provider 时必须下拉为空、按钮禁用，并提示等待接入真实模型提供商。
- Provider 设置页不能显示模拟类型、演示 endpoint、演示 secret、演示 health 或开发占位提供商行。
- API `/providers` 在无真实 OCR/LLM 时不返回旧模拟 fallback；默认 provider key 不能落到旧 OCR/LLM 演示 key。
- 后端识别创建必须在没有真实 OCR/LLM provider 时阻断，而不是静默调用内部 mock 编排。
- README、数据集规范页、用户可见源码不写模拟模型提供商或开发占位提供商主线；测试章节只能写合成样本和测试替身。

## TDD Tasks

- [x] AppShell 测试覆盖无真实 provider 时只显示 `Provider 待配置`，不显示 mock/开发占位。
- [x] NewRecognitionPage 测试覆盖 `/providers` 空 OCR/LLM 时禁用创建，并提示等待接入真实模型提供商。
- [x] ProviderSettingsPage 测试覆盖 API 列表为空时显示真实 provider 未配置，不显示 mock/开发占位。
- [x] API provider 测试覆盖 demo/production `/providers` 不返回旧 OCR/LLM 演示 key 或旧占位状态码。
- [x] API job 创建测试覆盖无真实 OCR/LLM provider 时 503 阻断，不创建识别任务。
- [x] 文档/用户源码测试覆盖 README、DatasetSpecPage 和主要用户页面不含指定用户主线禁词。

## Implementation Tasks

- [x] 移除 demo `/providers` 的 mock items；内部 mock 编排只留在测试/fixture/demo 内部。
- [x] 移除 production environment provider registry 中的 mock fallback item；保存的 mock/providerKind=mock 配置不进入业务列表。
- [x] provider health/default 对未暴露 mock key 返回合理未找到或未配置错误。
- [x] create job 前检查真实 OCR/LLM provider availability，无真实 provider 时阻断。
- [x] 更新 AppShell、NewRecognitionPage、ProviderSettingsPage、DatasetSpecPage、README、`.env.example` 和 seed 文案。
- [x] 新增 `MEDICAL-HARD-REMOVE-MOCK-PROVIDER-FIX-REPORT.md` 与 7 维度审计报告。

## Verification

- [x] `corepack pnpm --filter @medical-record-agent/demo-web test:styles`
- [x] `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`
- [x] `corepack pnpm --filter @medical-record-agent/demo-web build`
- [x] 相关前端/API 测试
- [x] 可行则 `corepack pnpm test`
- [x] 可行则 `corepack pnpm smoke:demo-web`
- [x] 检查 `http://127.0.0.1:9901/` 和 `/api/health`
- [x] 检查构建产物/用户可见源码禁词；测试文件内技术 mock 允许保留并在报告说明

## Verification Results

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：19 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：5 passed，14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过。
- `corepack pnpm test`：407 passed，1 skipped。
- `corepack pnpm smoke:demo-web`：通过，脚本运行模式为测试替身 runtime，不是业务 provider。
- `http://127.0.0.1:9901/`：200 OK。
- `http://127.0.0.1:9901/api/health`：200 OK，返回 `{"status":"ok","service":"medical-record-agent-api"}`。
- 构建产物和用户主线源码禁词扫描：通过；禁词仅保留在测试技术 mock、core 测试 provider 实现、production smoke 本地 contract 脚本、历史报告或 legacy 清理逻辑中。
