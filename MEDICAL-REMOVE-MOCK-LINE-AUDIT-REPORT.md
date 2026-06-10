# Medical Remove Mock Line Audit Report

Date: 2026-06-09

## 1. 产品概述

Medical Record Agent 是病历图片/PDF/OCR 文本结构化识别和 LIMS 写回治理系统。本轮审计目标是去掉用户可见 mock 主线，让真实操作路径回到：配置真实 OCR/LLM Provider -> 上传病历文件 -> 创建识别 -> 复核字段证据 -> 写回 LIMS。

## 2. 功能完整性

用户可见主线已不再显示 `Mock Provider Ready`。新建识别不默认 `mock-ocr`/`mock-model`，Provider 选择只接受真实启用 provider；只有开发占位 provider 时创建按钮禁用并提示配置真实 OCR/LLM Provider。Provider 设置页普通可选类型不含 Mock，API 列表中的开发占位项不能设置默认，health 不返回 healthy。

## 3. 业务流程完整性

识别流程现在以真实 provider 配置为前置条件。没有真实 OCR/LLM 时，页面阻断创建而不是自动回退 mock。评测页 provider fixture 已改为真实 LLM provider 选项；Dataset 规范页保留 CI/公开演示边界，但真实评测仍要求先配置真实 OCR/LLM Provider。

## 4. 用户体验

顶部状态、Provider 设置、新建识别和 README 均改为真实操作导向。开发占位 provider 会被标记为“开发占位，不可用于真实识别”，避免用户把内部测试能力理解成 ready 状态。按钮禁用和告警提示能直接指向 Provider 设置路径。

## 5. 技术实现

前端通过 `isMockProviderItem`/`normalizeProviderSelectOptions` 过滤 `isMock`、`development_placeholder`、`mock-*` 等内部 provider；Provider 设置页 health 匹配跳过 mock/disabled/development_placeholder。API demo/production fallback mock 保留但输出 `isMock: true`、disabled、非默认和 blocked health；production registry 拒绝把开发占位 provider 设为默认。单元测试覆盖 UI 状态、provider 过滤、API 标识和 health/default 边界。

## 6. 问题清单 P0/P1/P2

P0:
- 已解决：用户可见顶部不再出现 `Mock Provider Ready`。
- 已解决：新建识别不默认 mock provider；无真实 OCR/LLM provider 时禁用创建。
- 已解决：Provider 设置页普通主路径不再可选 Mock，也不显示 mock endpoint/mock secret/mock health 主线。
- 已解决：API mock fallback 明确标识开发占位，不能作为默认真实 provider。

P1:
- 已解决：README 增加真实操作路径，测试/CI provider 只作为内部说明。
- 已解决：Dataset 规范页不再把 mock provider 写成操作提示。
- 已解决：Evaluation 用户可见 provider 下拉测试不再期望 mock-model 作为选项。

P2:
- 保留：内部测试/CI mock 能力仍存在，用于合成样本、fixtures、demo/评估回放，不作为真实用户操作路径。
- 待配置：真实外部 OCR、真实 LLM、LIMS sandbox、外部 secret resolver 和可靠 broker 队列仍需按部署环境接入后做生产验收。

## 7. 验收结论

去 mock 用户主线阶段通过。内部测试/CI 可用，不作为真实用户操作路径。真实外部集成待配置，但 UI 不再误导 mock ready。

已通过验证：demo-web styles/mobile/build、相关前端/API 测试、全量 `corepack pnpm test`、`corepack pnpm smoke:demo-web`、`http://127.0.0.1:9901/` 和 `/api/health`。
