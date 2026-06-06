# Medical Record Agent - UI 整体优化计划

## 目标
对 demo-web 前端进行全面的界面优化，提升视觉品质、交互体验和响应式适配。

---

## 阶段一：设计系统升级 (Design System)

### 1.1 CSS 变量体系重构
- 扩展色彩系统：增加 semantic color tokens（如 `--border-subtle`, `--surface-elevated`）
- 新增间距系统：`--space-1` ~ `--space-12`（4px ~ 48px）
- 新增圆角系统：`--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-full`
- 新增阴影层级：`--shadow-sm`, `--shadow-md`, `--shadow-lg`
- 新增过渡动画：`--transition-fast`, `--transition-normal`

### 1.2 暗色模式 (Dark Mode)
- 新增 `dark` class 下的色彩变量覆盖
- 在 AppShell 中添加暗色模式切换按钮
- 所有组件使用 CSS 变量，自动适配明暗

### 1.3 排版优化
- 统一字号梯度：`--text-xs` ~ `--text-2xl`
- 行高优化：正文 1.6，标题 1.2
- 字体栈优化：加入系统中文字体 `PingFang SC`, `Microsoft YaHei`

---

## 阶段二：布局系统 (Layout)

### 2.1 侧边栏优化 (AppShell)
- 收缩态/展开态切换（图标模式 vs 图标+文字）
- 顶部添加 Logo 区域和品牌标识
- 导航分组：核心功能 / 运维管理 / 设置
- 当前页面高亮更明显（左侧边框 + 背景色）
- 底部固定用户信息和退出按钮
- 移动端：侧边栏变为抽屉式，汉堡菜单触发

### 2.2 页面容器
- 统一 `max-width` 和水平居中
- 页面标题区域增加面包屑导航
- 内容区增加合理的 padding 和 gap

---

## 阶段三：组件优化 (Components)

### 3.1 通用组件
- **MetricCard**: 增加图标背景色、趋势指示器（↑↓）、悬停微动画
- **StatusPill / JobStatusPill**: 圆角胶囊样式、带小圆点指示
- **PageHeader**: 增加描述文本、操作按钮区
- **SectionTitle**: 增加右侧操作链接区
- **StepGuide**: 优化引导弹出框样式

### 3.2 表格优化
- 表头增加排序指示器
- 行悬停高亮
- 斑马纹
- 空状态插图
- 响应式表格：窄屏转卡片布局

### 3.3 表单优化
- 输入框聚焦动画
- 统一的错误提示样式
- 按钮 loading 状态
- 分步表单进度指示

---

## 阶段四：页面级优化

### 4.1 Dashboard 页面
- 顶部状态卡片改为网格布局（2x2 或 3 列）
- Provider 健康状态用彩色卡片而非列表
- 最近任务表格增加状态筛选
- 添加快速操作入口（大按钮卡片）

### 4.2 Recognition 页面
- 新建识别：拖拽上传区域优化（虚线框 + 动画）
- Job Detail：证据展示改为卡片式，字段高亮更清晰

### 4.3 Schema Studio
- 左右分栏布局优化，可拖拽调整宽度
- 字段列表增加搜索和筛选
- 版本对比用 diff 视图展示

### 4.4 Evaluation 页面
- 指标卡片增加可视化图表（简单柱状图/折线图）
- 评估运行结果增加进度条

### 4.5 Operations 页面
- Provider Settings：卡片式布局，健康状态大图标
- Audit Log：时间轴样式展示
- Agent Trace：流程图式可视化

---

## 阶段五：响应式适配

### 5.1 断点系统
- `sm`: 640px（手机横屏）
- `md`: 768px（平板）
- `lg`: 1024px（小桌面）
- `xl`: 1280px（桌面）

### 5.2 适配策略
- 侧边栏：< 1024px 收缩为图标模式或隐藏
- 表格：< 768px 转为卡片列表
- 网格：< 640px 单列
- 字号：移动端适当放大触控区域

---

## 阶段六：动画与微交互

- 页面切换过渡动画（fade + slide）
- 卡片悬停抬起效果
- 按钮点击涟漪效果
- Loading 骨架屏
- 数据更新时的数字滚动动画

---

## 技术约束

- 不引入新的 UI 框架（保持纯 CSS + CSS 变量）
- 保持现有依赖不变（React 19, Vite, TanStack Query, lucide-react）
- 所有修改在新分支 `feature/ui-optimization` 上进行
- 每个阶段独立 commit，便于回滚

---

## 执行顺序

1. 创建分支 `feature/ui-optimization`
2. 阶段一：设计系统（styles.css 重构）
3. 阶段二：布局系统（AppShell 重构）
4. 阶段三：通用组件优化
5. 阶段四：各页面优化
6. 阶段五：响应式适配
7. 阶段六：动画微交互
