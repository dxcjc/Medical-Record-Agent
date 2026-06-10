# Medical Hard Remove Mock Provider Audit Report

## 1. 产品概述

Medical Record Agent 的当前产品主线是等待并接入真实 OCR/LLM Provider。没有真实模型提供商时，产品应显示待配置并阻断识别创建，不把 mock provider 或 development placeholder provider 表达为产品能力。

本次补修是因为二次验收发现文档和业务代码仍有残留。调度者二次复验又指出 2026-06-04 旧 spec 的 OCR Tool Node 仍有 1 个用户/当前文档主线残留；本轮已修复该残留并重新扫描。残留清理后，用户/业务/当前文档主线才可通过 hard remove 验收。

## 2. 功能完整性

API provider 列表、Provider 设置页、新建识别页、顶部状态、README、数据集说明和 seed 初始化已在上一轮切到真实 Provider 语义。本轮补齐遗漏：业务 normalizer/service 不再解析 mock provider 展示文案，当前架构与旧草案文档不再把 Mock Provider 写成架构必要部分、本地开发业务模式或可执行路线。

无真实 OCR/LLM Provider 时，新建识别不可创建；API 返回 `REAL_PROVIDER_NOT_CONFIGURED` / 503，且不创建 job。真实 Provider 接入后，系统继续支持 `http` OCR、`langchain`、`openai-compatible`、`openai-responses` 等真实主线。

## 3. 业务流程完整性

当前业务流程为：配置真实 OCR/LLM Provider -> Provider API 可见真实 provider -> 新建识别选择真实 provider -> 创建任务 -> 复核 -> 写回。缺少真实 OCR/LLM Provider 时，流程在创建识别前阻断，不再落回 mock 或占位。

本轮重点修复了两个会影响流程判断边界的残留：前端 normalizer 和 API service 的旧文案判断已删除，兼容过滤只基于结构化字段、旧 key 前缀、旧状态码和 provider kind。

## 4. 用户体验

AppShell 顶部只显示 `Provider 待配置` 或 `Provider 已连接`。NewRecognitionPage 在无真实 Provider 时下拉为空、按钮禁用，并提示“请先配置真实 OCR/LLM Provider；等待接入真实模型提供商。”ProviderSettingsPage 不再显示 Mock 类型、mock endpoint、mock secret、mock health 或开发占位 provider 行。

文档体验也已收敛：系统架构、教学页和 2026-06-04 旧 spec/plan 现在都把非真实外部能力限定为测试替身、fixture、合成样本和 contract test double，不再作为用户操作路径或本地业务模式。本轮补修后的 2026-06-04 旧 spec OCR Tool Node 只写真实 OCR provider，自动化验证只在测试边界使用 OCR contract test double 或 fixture。

## 5. 技术实现

demo service 不再向业务 provider registry 注册 mock OCR/LLM；production registry 不再把 environment mock fallback 或保存的 providerKind=mock 配置加入业务列表。health/default 对不可见 key 返回未找到或未配置错误。

production 运行时没有真实 OCR/LLM 时使用未配置错误 provider 做内部短路，不构造 core mock OCR/LLM。通用 job 创建逻辑在入队前检查真实 OCR/LLM availability，确保无真实 Provider 时不创建识别任务。

本轮新增的清理使非测试源码更干净：production smoke 的本地 contract runtime 和 core 测试替身默认 key 改为 fixture 语义；当前主线扫描不再需要豁免这些非测试实现文件。

## 6. 问题清单 P0/P1/P2

P0：已解决。二次验收指出的业务代码 `text.includes("mock provider")` 残留已删除；当前文档主线不再宣称 Mock Provider 是架构必要部分或本地业务模式。

P1：已解决。2026-06-04 旧 spec/plan 已标注历史草案，说明已被 2026-06-09 hard remove 方案取代；未伪造历史，只停止把旧草案当作当前执行方案。调度者二次复验发现的 `docs/superpowers/specs/2026-06-04-medical-record-recognition-agent-design.md:318` 单点残留已修复，最终主线禁词扫描现在 0 命中。

P2：无新增阻断。剩余 mock 字样只存在于历史报告和 `.test.*` 测试文件中，用于记录纠偏或验证旧数据不会进入业务主线。

## 7. 验收结论

hard remove mock provider 用户/业务/当前文档主线验收通过。

通过条件是本次二次验收和调度者二次复验残留全部清理后成立：业务代码不再围绕 mock provider 文案判断，当前架构/产品文档不再把 mock provider 写成可用路线，严格禁词扫描在非测试、非历史报告、非任务提示/log 范围内无命中。最终扫描已复跑，结果为 0 命中，`rg` exit code 1。

已执行验证：本轮新鲜用户/业务/当前文档主线禁词扫描、`http://127.0.0.1:9901/` 与 `/api/health` 检查。上一轮较重验证包括 demo-web style/mobile/build、相关前端/API/core/script 测试、全量 `corepack pnpm test`、`corepack pnpm typecheck` 和 `corepack pnpm smoke:demo-web`；本轮仅触及文档，未跑代码测试。
