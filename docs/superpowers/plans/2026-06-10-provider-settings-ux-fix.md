# 2026-06-10 Provider Settings UX Fix

本轮按用户要求执行 `brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion`。已在 `/tmp/Medical-Record-Agent` 内查找 `CLAUDE.md`，当前项目目录未发现该文件；相邻项目的 `CLAUDE.md` 不作为本仓库规则来源。

## Brainstorming

- 现有 API 路由已经区分 `PUT /providers/:key` 保存配置与 `POST /providers/:key/health` 健康检查；问题主要在保存 DTO 只做泛型结构校验、production registry 只检查 key/displayName，缺少当前 provider 类型字段校验。
- 前端 Provider 设置页把 OCR、LLM、Storage、LIMS 四个配置一次性 `Promise.all` 保存，文案也表达为“同步 4 个 Provider”，容易让用户认为保存被其他 provider 状态影响。
- 表单字段过于通用：`Endpoint`、`Model / Profile`、`Secret` 没有按 provider 类型说明填什么；Provider 类型直接显示英文枚举/技术名，不适合业务用户。
- 初始值里有示例密钥样式，虽然 SecretField 默认 password，但本地草稿仍可能把明文 secret 常驻保存；需要改为 secret 引用名/已配置状态表达，不把完整 secret 当页面主线。
- 不能恢复 mock/provider placeholder 主线；无真实 provider 时仍只允许保存配置草稿/配置项，识别创建能力保持 blocked。

## Writing Plan

1. 先补红灯测试：
   - route 层保存只调用当前 provider service，不触发 list/health/default。
   - route 层按当前 provider 类型和 `config.providerKind` 校验必填字段，返回具体字段提示。
   - production registry 保存也按当前 provider 类型校验，不检查其他 provider 健康。
   - 前端纯函数覆盖中文 label/value 分离、按类型字段配置、secret 默认脱敏、单 provider 保存请求。
2. 实现后端契约：
   - 保存接口只校验当前 payload 的结构和当前类型必填字段。
   - 健康检查继续独立返回当前 provider 状态、错误原因和建议，不影响保存。
   - 响应继续统一 secret redaction，不回传完整 apiKey。
3. 实现前端体验：
   - 每个 Provider 卡片提供“保存配置”“测试当前 Provider”“启用/停用”。
   - Provider 类型 Select 显示中文名称和说明，保存值保持稳定 providerKind。
   - 按类型展示 endpoint/baseUrl/model/bucket/headers/timeout 等字段说明和示例。
   - Secret 字段默认隐藏，表达为“密钥引用名”，避免明文常驻展示。
   - 保存/测试/缺字段/网络失败给中文反馈，且不暗示全部健康才能保存。
4. 局部样式：
   - Provider 卡片增加类型说明、字段帮助文案、动作栏和移动端单列布局。
   - 不粗暴重写全局 CSS，保留现有 Material + Arco UI。

## TDD

- 先运行新增/修改的 Provider 定向测试确认红灯。
- 实现后运行同一组测试到绿。
- 最终至少运行用户指定：
  - `corepack pnpm --filter @medical-record-agent/demo-web build`
  - `corepack pnpm test`

## Verification Before Completion

完成前记录真实执行结果：

- Provider 定向 vitest。
- `corepack pnpm --filter @medical-record-agent/demo-web build`
- `corepack pnpm test`
- 生成 `MEDICAL-PROVIDER-SETTINGS-UX-FIX-REPORT.md`。
- 生成 `MEDICAL-PROVIDER-SETTINGS-UX-AUDIT-REPORT.md`，包含 7 维度和验收结论。
