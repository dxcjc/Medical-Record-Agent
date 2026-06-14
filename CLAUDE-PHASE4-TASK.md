# Phase 4 任务说明 — 体验打磨

## 项目位置
`/tmp/Medical-Record-Agent`

## 背景
Phase 1（体验基础设施）、Phase 2（功能闭环）、Phase 3（数据与展示）已完成。系统功能完整、数据展示到位，现在需要从"能用"升级到"好用"——加载体验、移动端适配、空状态引导。

## 核心目标
4 项体验打磨：Skeleton 加载态、移动端响应式、空状态引导、Token 静默续期。

---

## 任务 1：Skeleton 加载态

### 改动文件
- `medical-ui/src/pages/DashboardPage.tsx` — 加载骨架屏
- `medical-ui/src/pages/JobsPage.tsx` — 加载骨架屏
- `medical-ui/src/pages/JobDetailPage.tsx` — 加载骨架屏
- `medical-ui/src/components/Skeleton.tsx` — 新建通用骨架屏组件

### 需求

1. **通用 Skeleton 组件**：
   - 创建 `Skeleton.tsx`，支持：圆形/方形/文本行
   - 支持 shimmer 动画效果（CSS @keyframes）
   - 使用 Arco Design 的 `<Skeleton>` 或自建（轻量）

2. **DashboardPage**：
   - 统计卡片加载时显示骨架屏（4 个灰色方块）
   - 趋势图加载时显示图表骨架屏
   - 快捷操作卡片加载时显示骨架屏

3. **JobsPage**：
   - 表格加载时显示 5-8 行骨架行
   - 每行骨架包含：checkbox + 5 个文本行 + 操作按钮骨架

4. **JobDetailPage**：
   - 图片加载时显示图片骨架
   - 字段卡片加载时显示卡片骨架

---

## 任务 2：移动端响应式

### 改动文件
- `medical-ui/src/App.tsx` — 侧边栏折叠逻辑
- `medical-ui/src/components/Layout.tsx` — 响应式布局
- `medical-ui/src/index.css` / 相关样式文件 — 媒体查询

### 需求

1. **侧边栏折叠**：
   - 视口宽度 ≤768px 时，侧边栏默认收起
   - 顶部增加汉堡菜单按钮（☰），点击展开/收起
   - 移动端展开时侧边栏覆盖内容（overlay），点击遮罩收起

2. **表格横向滚动**：
   - 移动端表格容器加 `overflow-x: auto`
   - 关键列（如任务ID、状态、操作）始终可见
   - 非关键列（如 Provider、创建人）可横向滚动查看

3. **触摸区域**：
   - 所有可点击元素最小触摸区域 44px × 44px
   - 按钮间距增大，避免误触

4. **表单适配**：
   - Modal/Drawer 在移动端全屏或接近全屏
   - 输入框宽度 100%

---

## 任务 3：空状态引导

### 改动文件
- `medical-ui/src/components/EmptyState.tsx` — 新建空状态组件
- `medical-ui/src/pages/JobsPage.tsx` — 空列表引导
- `medical-ui/src/pages/FeedbackPage.tsx` — 空列表引导
- `medical-ui/src/pages/ProviderPage.tsx` — 空列表引导
- `medical-ui/src/pages/SchemaPage.tsx` — 空列表引导

### 需求

1. **通用 EmptyState 组件**：
   - 图标（使用 Arco 的空状态图标或自定义 SVG）
   - 标题："暂无数据" / 自定义标题
   - 描述：说明为什么是空的 + 如何添加数据
   - 操作按钮（可选）：跳转到创建页面

2. **各页面空状态**：
   - **任务列表**：无任务时 → "还没有识别任务" + 「新建识别」按钮
   - **反馈管理**：无反馈时 → "暂无反馈记录" + "在识别结果中提交反馈后会显示在这里"
   - **Provider**：无 Provider 时 → "还没有配置 Provider" + 「新建 Provider」按钮
   - **Schema**：无 Schema 时 → "还没有 Schema 定义" + 「新建 Schema」按钮
   - **审计日志**：无日志时 → "暂无操作记录"

---

## 任务 4：Token 静默续期

### 改动文件
- `medical-ui/src/api/client.ts` — 拦截 401 尝试 refresh
- `medical-ui/src/stores/authStore.ts` — refresh token 逻辑

### 需求

1. **原理**：
   - API 返回 401 时，不立即跳转登录页
   - 先尝试用 refresh token 换取新 access token
   - 成功后重试原请求
   - 失败才跳转登录页

2. **实现**：
   - `client.ts` 的 401 处理中，先检查是否有 refresh token
   - 如果有，调用 `POST /auth/refresh`（如果后端没有这个端点，创建一个）
   - 刷新成功 → 更新 token → 重试原请求
   - 刷新失败 → 清除 token → 跳转登录页
   - 并发请求时：只发一次 refresh，其他请求等待

3. **后端**（如果需要）：
   - `POST /auth/refresh` — 接受 refreshToken，返回新的 accessToken
   - 如果后端当前不支持 refresh token，可以暂时跳过此任务

---

## 任务 5：构建验证 + 部署

### 步骤

1. 前端构建：
   ```bash
   cd /tmp/Medical-Record-Agent/medical-ui && npx vite build
   ```

2. 重启 API：
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

完成所有任务后，生成审计报告到 `/tmp/Medical-Record-Agent/PHASE4-AUDIT.md`，包含：

1. **功能完整性** — 每个任务的完成状态
2. **构建验证** — 前端 build 是否通过
3. **测试验证** — 后端测试通过数
4. **UI 验证** — Skeleton/响应式/空状态的效果描述
5. **代码质量** — 无硬编码、无 console.error 残留
6. **Git 提交** — commit hash 和 message

最后用 `git add -A && git commit -m "Phase 4: 体验打磨 - Skeleton加载态/移动端响应式/空状态引导" && git push` 提交。
