# demo-web P1/P2 优化闭环报告

生成时间：2026-06-09 CST

## 1. 本轮范围

本轮继续推进 `apps/demo-web` 的 P1/P2 优化闭环，保持现有 Material + Arco Design 企业级 UI，不改变 9901 nginx 部署方式和 `/api` 代理契约。

闭环目标：
- P1：确认并稳定 `scripts/production-smoke.test.ts` 中 Windows 路径 CLI 入口判断。
- P2：通过路由级 lazy loading 和 Vite `manualChunks` 拆分 demo-web JS chunk，消除主业务 chunk 超 500k 警告。
- 补齐全量测试中新暴露的 a11y 与 demo-web basic E2E helper 缺口。
- 生成本报告并更新 `MEDICAL-ARCO-UI-AUDIT-REPORT.md`。

## 2. Superpowers 流程记录

Brainstorming：
- 不重写 CSS，不回退既有 Arco 全局改造。
- P1 优先以现有测试契约验证 `file://`、Windows 盘符和反斜杠路径归一化。
- P2 优先路由级懒加载页面，再用稳定 manualChunks 分离 Arco、React/Router/Query 等核心依赖和交互库。

Writing-plans：
- 先跑 `production-smoke.test.ts` 和 demo-web build 复现状态。
- 再修改 `App.tsx`、`vite.config.ts`、少量样式和缺失 helper。
- 最后跑指定命令、全量测试和 9901 HTTP 验证。

TDD/测试优先：
- `scripts/production-smoke.test.ts` 已覆盖 Windows 路径入口判断，本轮验证为绿。
- `apps/demo-web/src/App.test.ts` 约束 `lazy()`、`Suspense` 和可访问 loading 状态。
- 全量测试第一次暴露 `staticA11y.test.ts` 与 `demo-web-basic-e2e.test.ts` 失败后，先定向修复并重跑通过，再重跑全量。

Verification-before-completion：
- 已完成用户指定 4 条测试/构建命令。
- 已完成 9901 `/` 与 `/api/health` 验证。
- 已确认 `dist/index.html` 与 9901 返回 HTML 引用同一新 bundle。

## 3. 修复点和文件

- `scripts/production-smoke.ts`
  - 入口判断使用路径归一化，兼容 `file:///D:/...` 与 `D:\...`。
  - 已由 `scripts/production-smoke.test.ts` 的 Windows 路径用例覆盖。

- `apps/demo-web/src/App.tsx`
  - 页面组件改为 `React.lazy()` 动态导入。
  - 使用 `Suspense` 包裹 `RouterProvider`，提供 `role="status"` 和 `aria-live="polite"` 的加载态。
  - 保留 `ConfigProvider`、`AuthProvider`、`QueryClientProvider` 和路由保护结构。

- `apps/demo-web/vite.config.ts`
  - 增加 Vite/Rollup `manualChunks`。
  - 分组为 `vendor-arco`、`vendor-interaction`、`vendor-core`，避免单个主业务 JS chunk 超 500k。
  - 未提高 `chunkSizeWarningLimit`，没有用忽略警告掩盖问题。

- `apps/demo-web/src/styles.css`
  - 增加 `.route-loading`，复用 `#3370FF` 和 `#F7F8FA` token。
  - 增加 `.skip-link` 键盘聚焦样式，不改变现有白色侧栏、active nav pill、移动端抽屉和 44px 触摸区规则。

- `apps/demo-web/src/layouts/AppShell.tsx`
  - 增加 `href="#main-content"` skip link。
  - 主内容增加 `id="main-content"`。
  - 全局搜索增加 `aria-label="全局页面搜索"`。

- `scripts/demo-web-basic-e2e.ts`
  - 新增 `resolveDemoWebRouteUrl()` 和 `extractAssetPaths()` 纯函数。
  - 提供可直接运行的基础 dev server smoke 入口，但本轮未改变 9901 部署。

## 4. 验证结果

- `corepack pnpm exec vitest run scripts/production-smoke.test.ts`：通过，7 tests passed。
- `corepack pnpm exec vitest run apps/demo-web/src/App.test.ts`：通过，1 test passed。
- `corepack pnpm exec vitest run apps/demo-web/src/a11y/staticA11y.test.ts scripts/demo-web-basic-e2e.test.ts`：通过，4 tests passed。
- `corepack pnpm exec tsc -p tsconfig.scripts.json`：通过。

用户指定命令：
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，6 tests passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，1 passed、5 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，无 500k JS chunk 警告。
- `corepack pnpm test`：通过，61 passed、1 skipped；278 passed、1 skipped。

Build 关键产物：
- 主入口：`dist/assets/index-gdY3ZDHf.js`，23.69 kB。
- `vendor-core-Bjp6EC4w.js`：421.63 kB。
- `vendor-arco-hrWV4cWL.js`：429.20 kB。
- 最大业务页面 chunk：`SchemaStudioPage-CaSoL3Zc.js`，26.76 kB。
- 路由页面已拆分为独立 chunk，build 未再输出 `Some chunks are larger than 500 kB`。

9901 验证：
- `curl -i --max-time 10 http://localhost:9901/`：200 OK。
- `curl -i --max-time 10 http://localhost:9901/api/health`：200 OK，返回 `{"status":"ok","service":"medical-record-agent-api"}`。
- `apps/demo-web/dist/index.html` 和 9901 返回 HTML 均引用 `/assets/index-gdY3ZDHf.js`，并 modulepreload `vendor-core`、`vendor-arco`、`vendor-interaction`。

## 5. 剩余问题

- 全量测试中仍有 Node `DEP0040 punycode` deprecation warning，未造成失败。
- `apps/api/src/repositories/repositoryDatabase.integration.test.ts` 仍因本地数据库集成环境未启用而按测试设计 skipped。
- Arco CSS vendor 产物约 570 kB，这是 CSS 体积，不是本轮 P2 指向的主 JS chunk 警告；build 未对其报 500k JS 警告。

## 6. 结论

P1 Windows 路径 CLI 入口判断已由测试确认稳定。P2 demo-web 主业务 JS chunk 已通过路由懒加载和 manualChunks 拆分，生产 build 不再出现 500k chunk 警告。9901 首页和 API 代理均保持可访问，现有 Material + Arco Design UI 约束未被破坏。

## 2026-06-09 产品级 7 维归档补齐

### 1. 产品概述

本报告原始范围聚焦 demo-web P1/P2 的 UI 构建稳定性和 chunk 优化。按本轮 P1/P2 延续审计补齐后，Medical Record Agent 的产品边界应理解为医疗病历识别与治理工作台：前端 UI 只是识别、Schema、Evaluation、Provider、写回、审计和安全治理链路的承载层，不能把 UI 阶段通过等同于医疗最终产品通过。

### 2. 功能完整性

已确认本轮之前的 UI 与工程化修复仍有效：路由 lazy loading、Arco 按需入口、manualChunks、skip link、移动端抽屉、44px 触摸区、样式守卫和 9901 静态部署均存在并通过验证。

产品级后续覆盖项也已由代码和测试确认：写回可信边界、demo API 按 jobId 返回 mock 编排结果、详情/写回静态 fallback 仅在 `VITE_DEMO_MODE=true` 启用、Evaluation run 按 `schemaKey/schemaVersionId` 解析 schema、API normalizer 集中化、识别本地文件处理 AbortSignal、session/queue/secret resolver contract、production smoke blocked 分类和浏览器 E2E 脚本均已落地。

### 3. 业务流程完整性

UI 当前阶段支持登录、上传病历、创建识别、查看详情、提交反馈、创建评测 run、Provider 设置、写回确认和审计查看。demo API 已从任意 jobId 静态假结果推进到按 jobId 运行 mock OCR/LLM/validation 编排；生产写回在确认路径中重新读取服务端持久化 RecognitionResult 的 `payload.writeback.readyFields`。

仍不能闭环为最终医疗产品：真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session invalidation store、真实 broker 多实例可靠队列和真实 production smoke 尚未通过。

### 4. 用户体验

Material + Arco Design UI 保持：Primary `#3370FF`、背景 `#F7F8FA`、白色侧栏、active nav pill、DM Sans + Noto Sans SC、移动端抽屉和单列布局。当前样式守卫与移动守卫通过，9901 首页可访问。静态演示详情和写回数据在非 demo mode 下不会掩盖真实 API 失败，降低生产误判风险。

### 5. 技术实现

本轮复验确认：

- `apps/demo-web/vite.config.ts` 保持 Arco exact alias 和 vendor chunk 策略，未提高 `chunkSizeWarningLimit`。
- `apps/api/src/bootstrap/production-services.ts` 的 production writeback executor 在 `confirmed=true` 路径读取服务端 job/result/readyFields。
- `apps/api/src/demo-services.ts` 创建 demo job 后运行 mock 编排并按 jobId 保存 result。
- `apps/api/src/bootstrap/production-services.ts` 的 production evaluation runner 按 run schema selection 解析 schema，不再固定内置 LIMS schema。
- `scripts/production-smoke.ts` 明确输出 configuration、secret-resolver、session-invalidation-store、queue-broker 的 blocked 分类。

### 6. 问题清单（P0/P1/P2）

P0：
- 未发现当前 demo-web build、9901 首页、`/api/health` 或全量测试阻断级 P0。

P1：
- 已闭环：Windows 路径 production smoke CLI 判断、写回服务端 readyFields 可信边界、Schema 发布二次确认、页面 API shape 迁移、识别本地读取取消/重跑、demo API job/result 闭环、非 demo 静态 fallback 禁用。
- 仍 blocked：真实 production smoke 缺少外部 sandbox 配置，不能把外部 OCR/LLM/LIMS 写为通过。

P2：
- 已闭环：demo-web 主业务 JS chunk 低于 500 kB 警告阈值；本地/契约级 session invalidation、queue、secret resolver、浏览器 E2E 脚本和 handoff 已落地。
- 仍 blocked：真实 KMS/Vault/Secret Manager、生产多实例 session invalidation store、真实 broker 多实例可靠队列、真实外部 smoke。
- 残余提示：全量测试仍有 Node `DEP0040 punycode` deprecation warning；数据库集成测试按当前环境 skipped。

### 7. 验收结论

本轮复验结果：

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，18 tests passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、13 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，入口 `/assets/index-DDGZMq2H.js`，最大 JS chunk `vendor-arco-_4u-J6Qa.js` 415.91 kB，无 500 kB JS warning。
- `corepack pnpm test`：通过，67 passed、1 skipped；367 passed、1 skipped；存在 `punycode` deprecation warning。
- `corepack pnpm smoke:production`：exit code 2，`STATUS blocked`，缺真实 sandbox、真实 secret resolver、生产多实例 session invalidation store、真实 broker。
- 9901 `/`：200 OK。
- 9901 `/api/health`：200 OK，返回 `{"status":"ok","service":"medical-record-agent-api"}`。
- `apps/demo-web/dist/index.html` 与 9901 返回 HTML 均引用 `/assets/index-DDGZMq2H.js`。

分层结论：UI 当前阶段通过；P1/P2 业务/安全/集成本轮推进为部分通过；真实外部集成 blocked；医疗最终产品 blocked，不能写最终通过。
