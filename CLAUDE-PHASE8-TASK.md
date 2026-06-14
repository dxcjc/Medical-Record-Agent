# Phase 8 任务说明 — 创建任务深度重构 + 全局体验修复

## 项目位置
`/tmp/Medical-Record-Agent`

## 重要：直接执行所有任务，不要问问题，不要只做计划！

## 背景
创建任务是系统最核心的功能，但目前完全不能用。根因是 `Notification.info()` 调用导致 Arco Design 渲染崩溃（`li.render is not a function`），整个 `handleSubmit` 静默失败。这不只是一个 bug——整个创建任务流程需要重构，让它真正可用。

---

## 任务 1：重构 NewRecognitionPage 创建任务流程

### 根因分析
1. `handleSubmit` 中使用 `Notification.info()` 创建通知，但 Notification 组件可能未正确初始化
2. 错误被 catch 块静默吞掉（`errors.push('文件处理失败')` 但不显示具体错误）
3. 示例文件 fetch 2.4MB → base64 → JSON body 可能导致内存/序列化问题

### 改动文件
- `medical-ui/src/pages/NewRecognitionPage.tsx` — 深度重构

### 具体需求

1. **移除 Notification，改用全局 Toast + 页面内状态**：
   - 删除所有 `Notification.info/success/error` 调用
   - 创建中：按钮显示 loading 状态 + 页面顶部进度条/文字
   - 创建成功：全局 `Message.success('任务创建成功')` + 自动跳转任务列表
   - 创建失败：全局 `Message.error('具体错误信息')` + 按钮恢复可点击

2. **错误处理不能静默吞掉**：
   - 当前 catch 块只 `errors.push('文件处理失败')`，不显示具体错误
   - 改为：catch 中 `Message.error(`文件 ${file.name} 上传失败: ${e.message}`)`
   - 每个步骤（上传文件、创建任务）的错误都要有明确的中文提示

3. **大文件上传优化**：
   - 当前 2.4MB 文件 → base64 → JSON body（约 3.3MB），可能导致请求超时
   - 改为 FormData 上传（如果后端支持），或保持 base64 但增加超时和重试
   - 上传进度提示（如果可能）

4. **交互流程优化**：
   - 点击"开始识别"后：
     a. 按钮显示 loading + 禁用
     b. 页面顶部显示进度卡片："正在上传文件 (1/1)..."
     c. 上传成功 → "正在创建识别任务..."
     d. 任务创建成功 → "✅ 任务创建成功，正在跳转..." → 2 秒后跳转任务列表
     e. 任何步骤失败 → 按钮恢复 + 显示具体错误

5. **"使用示例"流程优化**：
   - 当前：点击"使用示例" → 设置 useExample=true → 点击"开始识别" → fetch 示例文件 → 上传 → 创建
   - 优化：点击"使用示例" → 立即 fetch 文件并显示在文件列表中（不等到提交时才 fetch）
   - 这样用户在提交前就能看到示例文件已准备好

---

## 任务 2：修复审计日志 Invalid Date

### 根因
后端 `/audit` API 返回的 `createdAt` 是空对象 `{}`，不是 ISO 时间字符串。

### 改动文件
- 后端 audit service/repository
- `medical-ui/src/pages/AuditPage.tsx` — 前端兜底

### 具体需求
1. 后端修复：确保 AuditLog 查询返回 `createdAt` 字段为 ISO 时间字符串
2. 前端兜底：如果 createdAt 为 null/undefined/空对象，显示 `-` 而不是 `Invalid Date`
3. 格式化：`createdAt ? new Date(createdAt).toLocaleString('zh-CN') : '-'`

---

## 任务 3：修复 Provider 用户创建的被误禁用

### 根因
Phase 6 把所有 Provider 的编辑/删除/开关按钮都设为 disabled。应该只禁用系统内置的。

### 改动文件
- `medical-ui/src/pages/ProviderPage.tsx`

### 具体需求
1. 判断逻辑：数据库中的 Provider（createdAt 不为 null）可以编辑/删除
2. 配置 Provider（createdAt 为 null）禁用编辑/删除
3. 或者：后端返回 `isSystem` 字段
4. 用户创建的 Provider 的 switch 开关应该可以操作

---

## 任务 4：全局 Loading 状态

### 改动文件
- 所有使用 mutation 的页面

### 具体需求
1. 所有 mutation 操作执行时，按钮显示 loading 状态
2. 检查所有页面的 mutation 是否正确绑定了 `isPending`
3. 特别检查：Provider 删除/编辑、Schema 停用/启用、反馈审核

---

## 任务 5：表格文本截断

### 改动文件
- 全局 CSS 或表格组件

### 具体需求
1. 所有表格单元格：文本超出列宽时截断显示 `...`
2. CSS：`max-width` + `overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap`
3. hover 时显示完整文本（tooltip）
4. 特别处理：审计日志对象 ID 列、任务列表创建人列

---

## 任务 6：趋势图自动选中唯一 Schema

### 改动文件
- `medical-ui/src/pages/DashboardPage.tsx`

### 具体需求
1. 如果 Schema 列表只有一个选项，自动选中并显示趋势图
2. 不需要用户手动选择

---

## 任务 7：反馈列表空状态

### 改动文件
- `medical-ui/src/pages/FeedbackPage.tsx`

### 具体需求
1. 当反馈列表为空时，显示 EmptyState 组件
2. 不要只显示 Tab 和筛选器，下面什么都没有

---

## 任务 8：构建验证 + 提交

```bash
cd /tmp/Medical-Record-Agent/medical-ui && npx tsc --noEmit && npx vite build
cd /tmp/Medical-Record-Agent && npx vitest run
cd /tmp/Medical-Record-Agent && git add -A && git commit -m "Phase 8: 创建任务深度重构 + 全局体验修复" && git push
```

完成后生成 `/tmp/Medical-Record-Agent/PHASE8-AUDIT.md`。
