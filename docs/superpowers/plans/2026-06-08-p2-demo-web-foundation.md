# P2 Demo Web Foundation 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 修复 demo-web P2 工程化问题，补齐共享组件、TanStack Query 迁移样板、路由懒加载、表格能力、统一反馈、可访问性守护和基础 E2E 脚本。

**架构：** 采用渐进迁移：新增共享基础设施并迁移识别看板和审计日志两个跨模块页面作为样板。路由层统一懒加载，错误反馈和表格能力集中到共享模块。

**技术栈：** React 19、React Router 7、TanStack Query 5、Arco Design、Vitest、Vite dev server smoke script。

---

## 文件结构

- 创建：`apps/demo-web/src/components/MedicalDataTable.tsx`，共享表格组件和 helper。
- 创建：`apps/demo-web/src/components/MedicalDataTable.test.ts`，表格默认能力测试。
- 创建：`apps/demo-web/src/components/AppFeedback.ts`，统一 toast/error helper。
- 创建：`apps/demo-web/src/components/AppFeedback.test.ts`，错误码和 toast payload 测试。
- 创建：`apps/demo-web/src/api/queryKeys.ts`，TanStack Query key 工厂。
- 创建：`apps/demo-web/src/api/queryKeys.test.ts`，query key 稳定性测试。
- 创建：`apps/demo-web/src/App.test.ts`，路由级懒加载静态守护。
- 创建：`apps/demo-web/src/a11y/staticA11y.test.ts`，基础可访问性静态守护。
- 创建：`scripts/demo-web-basic-e2e.ts`，基础 E2E smoke 脚本。
- 创建：`scripts/demo-web-basic-e2e.test.ts`，E2E 脚本纯函数测试。
- 修改：`apps/demo-web/src/App.tsx`，路由页面懒加载和 Suspense fallback。
- 修改：`apps/demo-web/src/layouts/AppShell.tsx`，skip link、主内容 id、搜索 label、统一 toast。
- 修改：`apps/demo-web/src/pages/recognition/RecognitionDashboardPage.tsx`，迁移运行状态读取到 `useQuery`，使用共享表格。
- 修改：`apps/demo-web/src/pages/operations/AuditLogPage.tsx`，使用共享表格、统一 toast、表格排序筛选分页。
- 修改：`apps/demo-web/src/api/client.ts`，扩展错误码中文映射。
- 修改：`apps/demo-web/package.json` 和根 `package.json`，加入基础 E2E 脚本入口。

## 任务 1：红灯测试

- [ ] 编写 `MedicalDataTable.test.ts`，断言默认分页、文本筛选和数字排序。
- [ ] 编写 `queryKeys.test.ts`，断言 dashboard runtime query key 稳定。
- [ ] 编写 `AppFeedback.test.ts`，断言后端错误码翻译和 toast payload。
- [ ] 编写 `App.test.ts`，断言 `App.tsx` 使用 `lazy`、`Suspense` 和可访问加载状态。
- [ ] 编写 `staticA11y.test.ts`，断言 skip link、主内容 id、全局搜索 label 和共享表格 label。
- [ ] 编写 `demo-web-basic-e2e.test.ts`，断言 E2E 脚本 URL/HTML 解析。
- [ ] 运行定向 Vitest，预期失败来自缺失模块或缺失实现。

## 任务 2：最小实现

- [ ] 新增 `MedicalDataTable.tsx`，封装 Arco Table 默认分页和 helper。
- [ ] 新增 `queryKeys.ts`，提供 `medicalQueryKeys.dashboard.runtime(baseUrl)`。
- [ ] 新增 `AppFeedback.ts`，提供 `formatAppError()` 和 `showAppToast()`。
- [ ] 修改 `App.tsx`，将页面导入改为 `lazy()`，用 `Suspense` 包裹 RouterProvider。
- [ ] 修改 `AppShell.tsx`，接入 skip link、主内容 id、搜索 label 和统一 toast。
- [ ] 修改 `RecognitionDashboardPage.tsx`，用 `useQuery` 读取运行状态，并接入共享表格。
- [ ] 修改 `AuditLogPage.tsx`，接入共享表格、排序、筛选、分页和统一 toast。
- [ ] 新增基础 E2E 脚本并暴露 package script。

## 任务 3：绿灯和回归

- [ ] 运行新增定向测试，确认全部通过。
- [ ] 运行 `pnpm exec vitest run`（demo-web）确认前端可用测试通过。
- [ ] 运行根目录 `pnpm exec vitest run` 确认可用测试通过。
- [ ] 运行 `pnpm build` 确认仓库构建通过。
- [ ] 运行基础 E2E smoke 脚本，确认 dev server 入口和 SPA 回退可用。

## 任务 4：报告

- [ ] 生成 `/tmp/Medical-Record-Agent/P2-FIX-REPORT.md`。
- [ ] 报告逐项对应 P2 清单，记录 `CLAUDE.md` 缺失、本机 superpowers 指南读取、TDD 红绿过程和新鲜验证命令。
