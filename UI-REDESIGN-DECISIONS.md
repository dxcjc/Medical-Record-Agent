# 医疗 OCR UI/UX 重构决策记录

**决策时间**：2026-06-12
**决策人**：产品经理（AI）
**实现状态**：全部已实现

## 决策问题及实现

| # | 问题 | 决策 | 实现状态 | 实现位置 |
|---|------|------|----------|----------|
| 1 | 报错展示方式 | 统一用toast，不用Alert | ✅ 已实现 | toast.ts |
| 2 | 导航结构 | 13页→4个一级页面 | ✅ 已实现 | AppShell.tsx |
| 3 | 识别流程 | 3步引导式向导 | ✅ 已实现 | NewRecognitionPage.tsx |
| 4 | Schema暴露 | 隐藏到数据管理二级导航 | ✅ 已实现 | DataManagementPage.tsx |
| 5 | Provider选择 | 用识别类型自动匹配 | ✅ 已实现 | NewRecognitionPage.tsx |
| 6 | 结果展示 | 核心字段优先+技术字段折叠 | ✅ 已实现 | JobDetailPage.tsx |
| 7 | 任务进度 | 3阶段进度条+轮询 | ✅ 已实现 | NewRecognitionPage.tsx |
| 8 | 首次使用 | Dashboard 3步引导 | ✅ 已实现 | RecognitionDashboardPage.tsx |
| 9 | 表单校验 | 统一Arco Form rules | ✅ 已实现 | LoginPage/ProviderSettingsPage |

## 决策详情

### 1. 报错展示方式
**决策**：统一用Arco Message.toast，不用Alert组件
**理由**：toast更友好，不占用页面空间
**实现**：toast.ts工具函数，LoginPage/WritebackPage已替换

### 2. 导航结构
**决策**：13页精简为4个一级页面
**理由**：用户找不到功能，操作路径不清晰
**实现**：AppShell.tsx侧边栏只保留工作台/识别任务/数据管理/系统设置

### 3. 识别流程
**决策**：3步引导式向导（上传→识别中→确认结果）
**理由**：一条路径完成：上传→识别→查看→编辑→确认→导出
**实现**：NewRecognitionPage.tsx步骤化流程

### 4. Schema暴露
**决策**：隐藏到"数据管理"二级导航
**理由**：非技术用户不理解Schema概念
**实现**：DataManagementPage.tsx用Tabs切换子页面

### 5. Provider选择
**决策**：用识别类型（血常规/生化/尿常规）自动匹配
**理由**：用户不需要知道底层Provider
**实现**：NewRecognitionPage.tsx类型选择器自动设置Schema+Provider

### 6. 结果展示
**决策**：核心字段优先，技术字段折叠
**理由**：非技术用户看不懂技术细节
**实现**：JobDetailPage.tsx核心字段大卡片+Collapse折叠

### 7. 任务进度
**决策**：3阶段进度条（OCR30%/LLM80%/结果100%）
**理由**：用户需要知道任务进展
**实现**：NewRecognitionPage.tsx useEffect轮询+Progress组件

### 8. 首次使用
**决策**：Dashboard显示3步引导
**理由**：新用户不知道如何开始
**实现**：RecognitionDashboardPage.tsx localStorage记录引导状态

### 9. 表单校验
**决策**：统一使用Arco Form rules，中文错误提示
**理由**：表单校验不统一，错误提示不明确
**实现**：LoginPage/ProviderSettingsPage统一校验规则

---

## 全部决策已实现，UI/UX重构完成
