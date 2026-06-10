# P2 Demo Web Foundation Design

生成时间：2026-06-08 CST

## 背景

本轮 P2 修复聚焦 `apps/demo-web` 的前端工程化底座，而不是重写业务页面。现有系统已经完成 Arco UI、认证、真实 API client 和部分页面反馈，但仍存在跨模块组件重复、路由同步加载、表格能力不统一、反馈消息散落、可访问性缺少明确守护、E2E 入口缺失等问题。

仓库内未找到 `CLAUDE.md`；本轮按本机 `superpowers-zh` 指南执行。用户明确要求不要提问，因此 brainstorming 以非交互方式收敛为以下设计。

## 目标

1. 建立跨模块可复用的表格基础组件，统一分页、筛选、排序和可访问名称。
2. 保留 TanStack Query Provider，并迁移一个真实读接口场景到 `useQuery`，同时提供稳定 query key，作为渐进迁移样板。
3. 将路由页面改为路由级懒加载，减少初始 chunk 压力。
4. 建立统一 toast/error message helper，页面不直接拼装后端错误码。
5. 加入基础可访问性守护：跳转主内容、全局搜索 label、懒加载状态区、共享表格 label。
6. 提供基础 E2E smoke 脚本，能启动 demo-web dev server 并检查 SPA 入口和路由回退。

## 方案取舍

选择渐进式基础设施方案：新增共享工具并迁移高价值页面使用。这样能覆盖 P2 清单，又避免一次性重写所有页面导致回归风险。TanStack Query 先迁移识别看板运行状态，因为它读多个后端接口、天然需要缓存和刷新状态；其他页面保留现有请求方式，并在报告中明确迁移路线。

未选择一次性全量迁移所有表格和 API 请求，因为当前工作树已有大量既有改动，P2 目标更适合通过共享组件和样板路径降低后续迁移成本。

## 组件与数据流

- `src/components/MedicalDataTable.tsx`：封装 Arco Table 默认分页、空状态、可访问 label，并导出文本筛选和排序 helper。
- `src/components/AppFeedback.ts`：集中处理 toast 展示、`ApiClientError` 和未知错误文案。
- `src/api/queryKeys.ts`：提供 TanStack Query key 工厂，避免页面散写字符串数组。
- `RecognitionDashboardPage`：通过 `useQuery` 读取健康状态、Provider、Schema、Evaluation Dataset，并保留刷新按钮。
- `App.tsx`：使用 `React.lazy` 和 `Suspense` 包裹路由页面，提供带 `aria-live` 的加载状态。
- `scripts/demo-web-basic-e2e.ts`：启动 Vite dev server，探测 `/login` 与业务路由 SPA 回退，并解析入口资源。

## 错误处理

API 错误码由 `describeApiErrorCode()` 集中翻译；页面 toast 通过 `showAppToast()` 和 `formatAppError()` 输出。未知错误保留稳定兜底文案，避免直接暴露低层异常对象。

## 测试

先写 Vitest 红灯测试固定以下行为：

- 共享表格 helper 具备默认分页、筛选、排序。
- TanStack Query key 工厂稳定。
- App 路由页面懒加载且有可访问加载状态。
- 统一错误 helper 能翻译已知后端错误码。
- 静态可访问性守护覆盖 skip link、主内容 landmark、全局搜索 label、共享表格 label。
- 基础 E2E 脚本的 URL/HTML 解析逻辑可测试。

完成后运行 demo-web 定向测试、全量测试、`pnpm build`，并在报告中记录新鲜验证输出。
