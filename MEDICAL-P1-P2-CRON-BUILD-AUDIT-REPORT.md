# Medical P1/P2 Cron Build Audit Report

生成时间：2026-06-09 14:52:55 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台。demo-web 承载登录、识别、新建任务、任务详情、Schema Studio、Evaluation、Provider 设置、写回控制、反馈样本、Agent Trace、审计日志和数据集规范。

本轮审计聚焦 cron 新鲜验证发现的 demo-web build 阻断，不把本地 build/test 恢复误判为医疗最终产品完成。

## 2. 功能完整性

本轮已恢复：

- Provider 设置页可读取 Provider API list，并通过集中 normalizer 生成 `ApiProviderItem[]`。
- `displayName/status/config/secretRefs` 等 optional 字段只在值存在时写入对象，满足 `exactOptionalPropertyTypes: true`。
- Provider 保存、默认值设置、健康检查、mock provider 排除逻辑保持原有行为。
- Material + Arco Design UI 未被重写；Primary `#3370FF`、背景 `#F7F8FA`、白色侧栏、active nav pill、DM Sans + Noto Sans SC、移动端抽屉/单列/44px 触摸区继续由样式守卫覆盖。

未完整：

- 真实 OCR/LLM/LIMS sandbox 未通过。
- 真实 KMS/Vault/Secret Manager 未通过。
- 真实 broker 多实例队列和生产多实例 session invalidation store 未通过。

## 3. 业务流程完整性

Provider 运维流程当前可本地闭环：

- 前端读取 `/providers`。
- `normalizeProviderItems()` 归一化 Provider list，不显式写入 undefined optional 字段。
- 页面按 provider key/kind 匹配 OCR、LLM、Storage、LIMS，并避免把 mock/development placeholder 当作真实 provider。
- 保存配置继续只保存 secret 引用名；健康检查继续调用真实 provider health endpoint。

业务闭环边界：

- Provider UI 和 API contract 可本地闭环。
- 真实 provider runtime 仍依赖外部 OCR/LLM/LIMS sandbox 与真实 secret resolver；缺少这些 smoke 时不能判最终产品通过。

## 4. 用户体验

本轮未修改全局样式和页面视觉结构，避免回退既有企业级 Material + Arco Design：

- Provider 设置仍使用 Arco `Card/Form/Input/InputNumber/Select/Switch/Tag/Button`。
- 真实 Provider API 区、配置表单、健康检查和状态提示保持原有布局。
- 样式测试和移动端测试均通过，说明本轮类型修复未破坏主要 UI guard。

9901 体验状态：

- 首页 200 OK。
- `/api/health` 200 OK。
- 9901 HTML 引用最终真实 bundle `/assets/index-B7lcWWvU.js`。

## 5. 技术实现

关键实现：

- `apps/demo-web/src/api/normalizers.ts`
  - 新增 `normalizeProviderItems()`。
  - 必需字段一次性构造，optional 字段按存在性追加。
- `apps/demo-web/src/api/normalizers.test.ts`
  - 新增回归测试，模拟 runtime API payload 含显式 undefined，断言输出对象不含 undefined optional 键。
- `apps/demo-web/src/pages/operations/ProviderSettingsPage.tsx`
  - 移除页面内 Provider item 构造，调用集中 normalizer。
- `apps/api/src/bootstrap/production-services.ts`
  - 环境 OCR/LLM provider 的 `status` 改为条件展开，避免 `status: undefined`。

技术复扫：

- 生产源码中 `status/displayName/config/secretRefs` 等 optional 字段显式 undefined 模式无命中。
- demo-web 和 API typecheck 均通过。
- 全量测试通过，仍有既有 `punycode` deprecation warning。

## 6. P0/P1/P2 问题清单

P0：

- 本轮 cron build 阻断已修复；当前未发现 demo-web build、样式测试、移动端测试、全量测试、9901 首页或 `/api/health` 阻断级 P0。

P1 已闭环：

- ProviderSettingsPage exact optional build 阻断。
- Provider list response shape 从页面局部构造迁移到集中 normalizer。
- 可选字段显式 undefined 的同类生产源码模式已复扫并修正 API environment provider `status`。

P1 remaining/blocked：

- 真实 production smoke 外部 OCR/LLM/LIMS sandbox 未通过。
- 生产多实例 session invalidation store 未接真实共享存储并通过跨实例 smoke。

P2 已闭环：

- 本轮 build 产物继续保持路由 chunk 拆分，无 500 kB JS warning。
- Provider optional field normalizer 有回归测试覆盖。

P2 remaining/blocked：

- 真实 KMS/Vault/Secret Manager。
- 真实 Redis/RabbitMQ/SQS broker 多实例 lease/retry/dead-letter/heartbeat/status-result consistency smoke。
- 真实外部慢 provider 下的队列积压、重试、失败可视化仍需生产级 smoke。
- 既有 Node `DEP0040 punycode` deprecation warning 未处理。

## 7. 验收结论

验证结果：

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，19 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，入口 `/assets/index-B7lcWWvU.js`；最大 JS chunk `vendor-arco-_4u-J6Qa.js` 415.91 kB。
- `corepack pnpm test`：通过，68 passed、1 skipped files；395 passed、1 skipped tests。
- `http://localhost:9901/`：200 OK。
- `http://localhost:9901/api/health`：200 OK。
- dist 与 9901 HTML 均引用 `/assets/index-B7lcWWvU.js`。

分层结论：

- UI/本轮 build 阶段恢复通过。
- P1/P2 当前可本地闭环项通过。
- 真实外部集成 blocked。
- 医疗最终产品 blocked。真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、真实 broker 多实例可靠队列、生产多实例 session invalidation store 全部完成 smoke 前，不能声明最终完成。
