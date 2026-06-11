# 测试稳定性修复报告

生成时间：2026-06-11 16:40 CST

## 1. 产品概述

Medical Record Agent 是医疗病历结构化识别工作台。本报告覆盖测试稳定性修复（P0）和 Evaluation schema 解析验证（P1-4）。

## 2. 功能完整性

本轮修复范围：
- demo-services.test.ts 2个失败测试修复
- demo 编排器从依赖真实 HTTP OCR/LLM provider 改为使用 mock provider
- Evaluation schema 动态解析验证

## 3. 业务流程完整性

demo 模式业务流程：创建识别任务 → mock OCR → mock LLM 抽取 → 字段校验 → 返回结果。修复后流程不依赖外部 HTTP 服务，测试环境可稳定闭环。

## 4. 用户体验

测试稳定性直接影响 CI/CD 和开发者体验。修复后全量测试 77 文件全部通过，无 flaky 测试。

## 5. 技术实现

### 修复内容

**文件：`apps/api/src/demo-services.ts`**

- 移除 `createOcrProvider` 和 `createModelProvider` 导入（不再使用）
- 将 `realOcrProvider`（HTTP OCR at localhost:9001）替换为 `createMockOcrProvider()`
- 将 `realModelProvider`（HTTP LLM at 110.42.215.22）替换为 `createMockModelProvider()`
- demo 编排器使用 mock provider，避免依赖真实 HTTP 服务
- 不影响生产代码路径（production-services.ts 中的 provider 不变）

### Evaluation schema 解析验证

`apps/api/src/bootstrap/production-services.ts` 中 `createProductionEvaluationRunner` 已按 `schemaKey/schemaVersionId` 动态解析：
- 优先按 `schemaVersionId` 直接查找版本
- 其次按 `schemaKey` 查找 active 版本
- 最后 fallback 到 `limsClinicalInfoSchema`
- 测试覆盖：`production-services.test.ts:1295` "生产评估运行会按 run schemaKey 解析 active schema"

## 6. 问题清单（P0/P1/P2）

### P0
- 无当前阻断级 P0

### P1（已闭环）
- P1-3 Schema 发布门禁 ✅
- P1-4 Evaluation schema 解析 ✅（已修复并有测试覆盖）
- P1-6 API 契约集中 ✅
- P1-8 长任务取消 ✅
- demo API 闭环 ✅
- 写回可信边界 ✅

### P1（仍 blocked，需外部环境）
- P1-5 Production smoke — 缺真实 OCR/LLM/LIMS sandbox
- P1-6 API unknown 类型 — 部分路由 service interface 仍用 unknown

### P2（仍 blocked，需外部依赖）
- 异步任务队列 — contract 已有，需真实 broker
- 密钥库 — secretRefs 已脱敏，需 KMS/Vault
- 浏览器 E2E — 需 Playwright/Cypress
- 安全基线 — JWT/CSP/HttpOnly cookie 需产品化

## 7. 验收结论

**阶段通过。**

验证结果：
- `corepack pnpm test`：77 passed, 1 skipped; 454 passed, 1 skipped ✅
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，入口 index-DexDPpno.js，最大 chunk vendor-arco 415.91 kB ✅
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：19 passed ✅
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：5 passed, 14 skipped ✅
- `http://localhost:9901/`：200 OK ✅
- `http://localhost:9901/api/health`：200 OK ✅

P0 测试稳定性已修复，P1-4 Evaluation schema 已验证。医疗项目当前阶段（UI + P1 核心修复 + 测试稳定性）通过。最终产品通过仍需真实外部环境（OCR/LLM/LIMS sandbox、密钥库、broker、E2E）。
