# Phase 1 任务说明 — 体验基础设施

## 项目位置
`/tmp/Medical-Record-Agent`

## 背景
Medical Record Agent 是医学检验报告智能识别系统。当前系统"能跑通"但体验差：按钮点了没反应、错误信息是英文技术术语、刷新丢登录、API 路由 404。

## 核心目标
让系统"不会静默失败"——所有按钮有反馈，所有错误有中文提示。

---

## 任务 1：全局 API 错误拦截器 + 错误信息中文化

### 改动文件
- `medical-ui/src/api/client.ts` — 改造 request() 函数
- `medical-ui/src/api/errorMessages.ts` — 新建

### 具体需求

1. **POST/DELETE/PUT 无 body 自动补 `{}`**
   - 在 `request()` 函数中，如果 method 是 POST/DELETE/PUT 且 body 为 undefined，自动设为 `JSON.stringify({})`
   - 这修复了 5 个按钮（停用/回滚/删除/重跑/触发回写）点击无反应的问题

2. **统一错误处理**
   - 所有非 ok 响应，尝试提取服务端的 `message` 或 `error` 字段
   - 抛出的 ApiError 包含：status（HTTP 状态码）、body（服务端响应体）、userMessage（中文提示）

3. **401 去重锁**
   - 全局变量 `isRedirectingToLogin`
   - 多个请求同时 401 时，只执行一次 `window.location.href = '/login'`
   - 5 秒后重置 flag

4. **错误信息中文化**
   - 新建 `medical-ui/src/api/errorMessages.ts`
   - 映射表：
     ```
     FST_ERR_CTP_EMPTY_JSON_BODY → "请求格式错误，请重试"
     Unauthorized → "登录已过期，请重新登录"
     NetworkError → "网络连接失败，请检查网络"
     400 → "请求参数错误"
     403 → "没有权限执行此操作"
     404 → "请求的资源不存在"
     500 → "服务器内部错误，请稍后重试"
     ```
   - 在 `request()` 的 catch 中，如果有 ApiError，用 `userMessage` 覆盖技术错误信息

---

## 任务 2：全局 React Error Boundary

### 改动文件
- `medical-ui/src/components/ErrorBoundary.tsx` — 新建
- `medical-ui/src/App.tsx` — 包裹路由

### 具体需求

1. 创建 `ErrorBoundary` 类组件（必须是 class component，function component 不支持 componentDidCatch）
2. 捕获子组件渲染错误，显示友好错误页：
   - 图标（可用 Arco 的 IconFaceFrownFill 或类似）
   - "页面出错了" 标题
   - "请刷新页面或返回首页" 提示
   - 两个按钮：「刷新页面」(window.location.reload()) 「返回首页」(navigate('/'))
3. 在 `App.tsx` 中用 ErrorBoundary 包裹 `<Routes>` 或整个页面内容

---

## 任务 3：全局网络状态检测

### 改动文件
- `medical-ui/src/components/NetworkStatus.tsx` — 新建
- `medical-ui/src/App.tsx` — 挂载组件

### 具体需求

1. 组件内部每 30 秒 fetch 一个轻量 API（如 `/api/health` 或 `/api/stats/dashboard`）
2. 连续 2 次失败 → 显示页面顶部红色提示条 "⚠️ 服务器连接中断，请检查网络"
3. 恢复后自动消失
4. 提示条样式：fixed 定位，z-index 最高，红色背景，白色文字

---

## 任务 4：修复登录状态持久化

### 改动文件
- `medical-ui/src/App.tsx`

### 具体需求

1. App 组件挂载时（useEffect）调用 `authStore.getState().restore()`
2. restore() 已经存在，从 localStorage 读取 token
3. 注意：restore() 内部会调用 API 验证 token，失败则清除
4. 在 restore 完成前，显示 loading 而不是跳转到登录页

---

## 任务 5：修复 API 路由前缀不一致

### 改动文件
- 后端 `src/routes/` 目录下 stats 相关路由文件

### 具体需求

1. 检查所有后端路由注册，找出带 `/api/` 前缀的路由
2. 统一去掉 `/api/` 前缀
3. 特别检查这些路由：
   - `/api/stats/fields` → 改为 `/stats/fields`
   - `/api/stats/dashboard` → 改为 `/stats/dashboard`
   - `/api/stats/trend` → 改为 `/stats/trend`
4. 原因：nginx 反代已经把 `/api/*` 去掉 `/api` 前缀转发，后端不应再带

---

## 任务 6：补全缺失的 API 路由

### 改动文件
- 后端 `src/routes/feedback.ts`
- 后端 `src/routes/providers.ts`
- 后端 `src/routes/jobs.ts`

### 具体需求

1. **PATCH /feedback/:id** — 更新反馈审核状态
   - 请求体：`{ status: 'approved' | 'rejected' }`
   - 返回更新后的 FeedbackSubmission 记录
   - 如果 approved，写入 KnowledgeEntry 表

2. **POST /providers** — 创建 Provider
   - 请求体：`{ key, name, type, endpoint, apiKey, isDefault }`
   - 返回创建的 Provider 记录

3. **GET /jobs/:id/export** — 导出任务结果
   - 返回 JSON 格式的识别结果
   - 包含：任务信息、识别字段、置信度

---

## 任务 7：构建验证 + 部署

### 步骤

1. 前端构建：
   ```bash
   cd /tmp/Medical-Record-Agent/medical-ui && npx vite build
   ```

2. 重启 API（必须用 start-api.sh，它会加载 .env）：
   ```bash
   cd /tmp/Medical-Record-Agent && bash start-api.sh
   ```

3. 重载 nginx：
   ```bash
   sudo systemctl reload nginx
   ```

4. 运行后端测试：
   ```bash
   cd /tmp/Medical-Record-Agent && npx vitest run
   ```

---

## 验收标准

完成所有任务后，生成审计报告到 `/tmp/Medical-Record-Agent/PHASE1-AUDIT.md`，包含：

1. **功能完整性** — 每个任务的完成状态
2. **构建验证** — 前端 build 是否通过
3. **测试验证** — 后端测试通过数
4. **API 验证** — 新增/修复的 API curl 测试结果
5. **UI 验证** — 关键按钮点击是否有反馈
6. **错误处理** — 错误信息是否中文化
7. **代码质量** — 无 console.error 残留
8. **Git 提交** — commit hash 和 message

最后用 `git add -A && git commit -m "Phase 1: 体验基础设施 - 全局错误处理/路由修复/登录持久化" && git push` 提交。
