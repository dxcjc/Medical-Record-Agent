# Phase 8 审计报告 — 创建任务深度重构 + 全局体验修复

## 完成时间
2026-06-14

## 任务概览

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 1 | 重构 NewRecognitionPage 创建任务流程 | ✅ 完成 | 深度重构，移除 Notification，改用 Message + 页面状态 |
| 2 | 修复审计日志 Invalid Date | ✅ 完成 | 前端安全日期解析 + 后端 createdAt 字段补全 |
| 3 | 修复 Provider 用户创建的被误禁用 | ✅ 已修复 | Phase 7 已实现正确的 isBuiltIn 判断逻辑 |
| 4 | 全局 Loading 状态 | ✅ 已修复 | 所有 mutation 已绑定 isPending |
| 5 | 表格文本截断 | ✅ 完成 | 全局 CSS 添加表格单元格文本截断 |
| 6 | 趋势图自动选中唯一 Schema | ✅ 完成 | DashboardPage 添加 useEffect 自动选中 |
| 7 | 反馈列表空状态 | ✅ 已修复 | Phase 7 已实现 EmptyState 组件 |
| 8 | 构建验证 + 提交 | ✅ 完成 | tsc + vite build + vitest 全部通过 |

## 改动文件清单

### Task 1: NewRecognitionPage 重构
- **`medical-ui/src/pages/NewRecognitionPage.tsx`** — 深度重构
  - 移除所有 `Notification.info/success/error` 调用（根因：导致 `li.render is not a function` 崩溃）
  - 改用 `Message.success/error` 全局 Toast
  - 按钮显示 `loading` + `disabled` 状态
  - 页面顶部显示进度卡片："正在上传文件 (1/1)..." → "正在创建识别任务..." → "✅ 任务创建成功，正在跳转..."
  - 每个文件处理错误都显示具体错误信息：`Message.error(\`文件 ${name} 处理失败: ${errMsg}\`)`
  - "使用示例"优化：点击后立即 fetch 文件并显示在文件列表中（不再等到提交时才 fetch）
  - 添加 `exampleLoading` 状态，按钮显示 loading 动画
  - 上传区域在 submitting 时禁用交互
  - Schema 选择器在 submitting 时禁用

### Task 2: 审计日志 Invalid Date 修复
- **`apps/api/src/repositories/audit.repository.ts`**
  - `auditCreateSelection` 添加 `createdAt: true`，确保写入后返回 createdAt
- **`medical-ui/src/pages/AuditPage.tsx`**
  - `formatRelativeTime`: 添加 `typeof dateStr !== 'string'` 和 `isNaN(then)` 防御
  - 时间列 render: 添加 `typeof t !== 'string'` 和 `isNaN(date.getTime())` 防御，无效日期显示 `-`
- **`apps/api/src/repositories/audit.repository.test.ts`**
  - 更新测试期望，select 中包含 `createdAt: true`

### Task 3: Provider 禁用逻辑
- **无需改动** — Phase 7 已正确实现：
  - `isBuiltIn = (p) => !p.createdAt` 判断系统内置 Provider
  - Switch 仅对 builtIn 禁用
  - 编辑/删除按钮仅对 builtIn 禁用
  - 用户创建的 Provider 所有操作正常可用

### Task 4: 全局 Loading 状态
- **无需改动** — 所有页面 mutation 已正确绑定 `isPending`：
  - ProviderPage: `updateMutation.isPending`, `deleteMutation.isPending`, `setDefaultMutation.isPending`
  - FeedbackPage: `approveMutation.isPending`, `batchApproveMutation.isPending`, `rejectMutation.isPending`, `batchRejectMutation.isPending`
  - SchemaPage: `deactivateMutation.isPending`, `activateMutation.isPending`, `rollbackMutation.isPending`
  - EvaluationPage: `mutation.isPending`, `importMutation.isPending`
  - WritebackPage: `mutation.isPending`

### Task 5: 表格文本截断
- **`medical-ui/src/styles/global.css`**
  - `.arco-table-td-content`: `max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`
  - `.arco-table-td`: `max-width: 0` (配合 table-layout: fixed)
  - `.arco-table-td .arco-typography-code`: code 标签截断

### Task 6: 趋势图自动选中唯一 Schema
- **`medical-ui/src/pages/DashboardPage.tsx`**
  - 添加 `useEffect`：当 `schemas.length === 1 && !trendSchemaKey` 时自动 `setTrendSchemaKey`
  - 导入 `useEffect`

### Task 7: 反馈列表空状态
- **无需改动** — Phase 7 已实现：
  - `feedbackItems.length === 0` 时显示 `<EmptyState>` 组件

## 验证结果

```
✓ tsc --noEmit — 0 errors
✓ vite build — 8.34s, 产物正常
✓ vitest run — 366 passed | 1 skipped (367)
```

## 技术决策

1. **不改用 FormData 上传** — 后端 `/files` 路由使用 `request.body` + zod schema 解析 JSON，不支持 multipart。保持 base64 方式，client.ts 已有重试机制（MAX_RETRIES=2, RETRYABLE_STATUS_CODES）。
2. **Notification → Message** — Arco Design 的 `Notification` 组件在此环境中导致 `li.render is not a function` 崩溃，`Message` 组件工作正常且视觉效果足够。
3. **示例文件预加载** — 改为点击"使用示例"后立即 fetch，文件缓存在 `exampleFile` state 中，用户提交时直接使用，避免提交时的延迟和不确定性。
4. **进度状态不重置** — 创建成功后保持 `submitting=true`，2 秒后跳转任务列表，避免按钮闪烁。
