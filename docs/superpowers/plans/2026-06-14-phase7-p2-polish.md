# Phase 7: P2 优化项 + 引导系统 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 打磨体验细节——上传区域占满宽度 + Toast 反馈、Dashboard 新手引导、面包屑显示模块分组名。

**架构：** 三个独立 UI 改动，互不依赖。上传区去掉 `maxWidth:640` 限制并增加 Toast；Dashboard 在 KPI 卡片后插入条件渲染的引导区；面包屑从固定"医疗识别"改为动态模块名。

**技术栈：** React + TypeScript + Arco Design (`@arco-design/web-react`) + react-router-dom

---

## 文件清单

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `medical-ui/src/pages/NewRecognitionPage.tsx` | 上传区宽度/高度优化 + Toast 提示 |
| 修改 | `medical-ui/src/pages/DashboardPage.tsx` | 新增快速上手引导区 |
| 修改 | `medical-ui/src/layout/AppLayout.tsx` | 面包屑显示模块分组名 |

---

### 任务 1：上传区域宽度优化

**文件：**
- 修改：`medical-ui/src/pages/NewRecognitionPage.tsx:252` — 去掉 maxWidth 限制
- 修改：`medical-ui/src/pages/NewRecognitionPage.tsx:294-300` — 增大拖拽区高度和样式

- [ ] **步骤 1：去掉外层 maxWidth 限制**

将第 252 行的 `<div style={{ maxWidth: 640 }}>` 改为无限制宽度：

```tsx
// 旧：
<div style={{ maxWidth: 640 }}>

// 新：
<div>
```

- [ ] **步骤 2：增大拖拽上传区 min-height 并加强样式**

将第 294 行的上传区内 div 替换为更醒目的样式：

```tsx
// 旧（第 294-300 行）：
<div style={{ padding: 20, textAlign: 'center' }}>
  <IconUpload size={32} style={{ color: 'var(--color-muted)', marginBottom: 8 }} />
  <p style={{ fontSize: 14 }}>点击或拖拽文件到此处上传</p>
  <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
    支持图片、PDF 等格式，可多选，单文件最大 20MB
  </p>
</div>

// 新：
<div style={{
  padding: 32,
  textAlign: 'center',
  minHeight: 200,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  border: '2px dashed var(--color-border)',
  borderRadius: 8,
  transition: 'border-color 0.2s, background 0.2s',
  background: 'var(--color-fill-1)',
}}
  onMouseEnter={(e) => {
    e.currentTarget.style.borderColor = 'var(--color-primary)';
    e.currentTarget.style.background = 'var(--color-primary-light-1)';
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.borderColor = 'var(--color-border)';
    e.currentTarget.style.background = 'var(--color-fill-1)';
  }}
>
  <IconUpload size={40} style={{ color: 'var(--color-primary-light-3)', marginBottom: 12 }} />
  <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>点击或拖拽文件到此处上传</p>
  <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 8 }}>
    支持图片、PDF 等格式，可多选，单文件最大 20MB
  </p>
</div>
```

- [ ] **步骤 3：提交**

```bash
git add medical-ui/src/pages/NewRecognitionPage.tsx
git commit -m "feat(ui): 上传区域占满可用宽度并增加拖拽悬停效果"
```

---

### 任务 2：上传文件 Toast 提示

**文件：**
- 修改：`medical-ui/src/pages/NewRecognitionPage.tsx:270-291` — 文件选择回调中增加 Toast
- 修改：`medical-ui/src/pages/NewRecognitionPage.tsx:53-55` — 文件移除回调中增加 Toast

- [ ] **步骤 1：在文件选择 onChange 回调中添加成功 Toast**

在 `onChange` 回调的 `setFiles` 调用之后，添加 `Message.success`。找到第 283-290 行的 `setFiles((prev) => { ... })` 块，在其外部、`if (incoming.length > 0)` 块的末尾添加 Toast：

```tsx
// 在 setFiles 的回调之后，if 块的 } 之前，增加：
Message.success(`已选择 ${incoming.length} 个文件`);
```

完整替换 `onChange` 回调的后半段（第 283-291 行）：

```tsx
setFiles((prev) => {
  // Deduplicate by name + size
  const existingKeys = new Set(prev.map((f) => `${f.name}::${f.size}`));
  const unique = incoming.filter(
    (f) => !existingKeys.has(`${f.name}::${f.size}`)
  );
  return unique.length > 0 ? [...prev, ...unique] : prev;
});
Message.success(`已选择 ${incoming.length} 个文件`);
```

- [ ] **步骤 2：在文件移除时添加 Toast**

修改 `handleRemoveFile` 函数（第 53-55 行），在移除前记录文件名并显示提示：

```tsx
// 旧：
const handleRemoveFile = (index: number) => {
  setFiles((prev) => prev.filter((_, i) => i !== index));
};

// 新：
const handleRemoveFile = (index: number) => {
  const fileName = files[index]?.name;
  setFiles((prev) => prev.filter((_, i) => i !== index));
  if (fileName) {
    Message.info(`已移除文件 ${fileName}`);
  }
};
```

- [ ] **步骤 3：提交**

```bash
git add medical-ui/src/pages/NewRecognitionPage.tsx
git commit -m "feat(ui): 上传/移除文件时显示全局 Toast 提示"
```

---

### 任务 3：Dashboard 快速上手引导系统

**文件：**
- 修改：`medical-ui/src/pages/DashboardPage.tsx` — 在 KPI 卡片后、趋势图前插入引导区

- [ ] **步骤 1：添加引导步骤数据和图标导入**

在文件顶部的图标导入中确认已存在以下图标（第 5-13 行区域）。若缺少 `IconCheckCircle`、`IconArrowRight` 则补充。当前已有 `IconCheckCircle` 和 `IconFileUp`，足够使用。

在 `QUICK_ACTIONS` 数组定义之前（第 126 行之前），添加引导步骤数据：

```tsx
/* ------------------------------------------------------------------ */
/*  快速上手引导                                                          */
/* ------------------------------------------------------------------ */

interface OnboardingStep {
  step: number;
  title: string;
  description: string;
  icon: typeof IconFileUp;
  color: string;
  actionLabel?: string;
  actionPath?: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    step: 1,
    title: '上传文档',
    description: '支持图片、PDF 等医疗文档格式',
    icon: IconFileUp,
    color: '#3370FF',
    actionLabel: '去上传',
    actionPath: '/recognition/new',
  },
  {
    step: 2,
    title: 'AI 识别',
    description: '系统自动识别并提取结构化数据',
    icon: IconDatabase,
    color: '#00B42A',
  },
  {
    step: 3,
    title: '人工复核',
    description: '检查识别结果，提交反馈优化准确率',
    icon: IconCheckCircle,
    color: '#722ED1',
  },
];
```

- [ ] **步骤 2：在渲染中插入引导区**

在 KPI Cards 的 `</Row>` 之后（第 284 行后），趋势图 `<Card` 之前（第 287 行前），插入引导区 JSX：

```tsx
{/* 快速上手引导 — 任务数 ≤ 5 时显示 */}
{!isLoading && jobs.length <= 5 && (
  <Card
    title="🚀 快速上手"
    style={{ marginBottom: 24 }}
    bordered
  >
    <Row gutter={16}>
      {ONBOARDING_STEPS.map((step) => {
        const Icon = step.icon;
        return (
          <Col key={step.step} xs={24} sm={8}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              padding: '16px 12px',
            }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: `${step.color}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}>
                <Icon size={24} style={{ color: step.color }} />
              </div>
              <div style={{
                fontSize: 12,
                color: step.color,
                fontWeight: 600,
                marginBottom: 4,
              }}>
                步骤 {step.step}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                {step.title}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-3)', marginBottom: step.actionLabel ? 12 : 0 }}>
                {step.description}
              </div>
              {step.actionLabel && step.actionPath && (
                <Button
                  type="outline"
                  size="small"
                  onClick={() => navigate(step.actionPath!)}
                >
                  {step.actionLabel}
                </Button>
              )}
            </div>
          </Col>
        );
      })}
    </Row>
  </Card>
)}
```

- [ ] **步骤 3：确认 `jobs` 变量可用于条件判断**

`jobs` 在第 145 行已定义为 `const jobs = jobsData?.items || [];`。引导区条件 `jobs.length <= 5` 使用的是已加载的完整任务列表。当 `isLoading` 为 true 时不渲染引导区（避免闪烁）。此逻辑无需额外改动。

- [ ] **步骤 4：提交**

```bash
git add medical-ui/src/pages/DashboardPage.tsx
git commit -m "feat(ui): Dashboard 新增快速上手引导系统，任务数 ≤ 5 时显示"
```

---

### 任务 4：面包屑导航修复 — 显示模块分组名

**文件：**
- 修改：`medical-ui/src/layout/AppLayout.tsx:72-82` — 将 PAGE_TITLES 从简单字符串改为 `{ title, group }` 结构
- 修改：`medical-ui/src/layout/AppLayout.tsx:125-130` — 更新 pageTitle 解析逻辑
- 修改：`medical-ui/src/layout/AppLayout.tsx:236-239` — 更新面包屑渲染

- [ ] **步骤 1：扩展 PAGE_TITLES 为包含模块名的结构**

将第 72-82 行替换：

```tsx
// 旧：
const PAGE_TITLES: Record<string, string> = {
  '/': '工作台',
  '/jobs': '任务列表',
  '/recognition/new': '新建识别',
  '/schemas': 'Schema 管理',
  '/providers': 'Provider',
  '/evaluation': '评测中心',
  '/audit': '审计日志',
  '/feedback': '反馈管理',
  '/writeback': '回写管理',
};

// 新：
interface PageInfo {
  title: string;
  group: string;
}

const PAGE_INFO: Record<string, PageInfo> = {
  '/': { title: '工作台', group: '概览' },
  '/jobs': { title: '任务列表', group: '识别管理' },
  '/recognition/new': { title: '新建识别', group: '识别管理' },
  '/schemas': { title: 'Schema 管理', group: '配置管理' },
  '/providers': { title: 'Provider', group: '配置管理' },
  '/evaluation': { title: '评测中心', group: '质量保障' },
  '/audit': { title: '审计日志', group: '质量保障' },
  '/feedback': { title: '反馈管理', group: '质量保障' },
  '/writeback': { title: '回写管理', group: '质量保障' },
};
```

- [ ] **步骤 2：更新 pageTitle 和新增 pageGroup 解析**

将第 125-130 行替换：

```tsx
// 旧：
const pageTitle = useMemo(() => {
  const path = location.pathname;
  if (PAGE_TITLES[path]) return PAGE_TITLES[path];
  if (path.startsWith('/jobs/')) return '任务详情';
  return '医疗记录识别';
}, [location.pathname]);

// 新：
const pageTitle = useMemo(() => {
  const path = location.pathname;
  if (PAGE_INFO[path]) return PAGE_INFO[path].title;
  if (path.startsWith('/jobs/')) return '任务详情';
  return '医疗记录识别';
}, [location.pathname]);

const pageGroup = useMemo(() => {
  const path = location.pathname;
  if (PAGE_INFO[path]) return PAGE_INFO[path].group;
  if (path.startsWith('/jobs/')) return '识别管理';
  return '概览';
}, [location.pathname]);
```

- [ ] **步骤 3：更新面包屑渲染**

将第 236-239 行替换：

```tsx
// 旧：
<Breadcrumb className="app-breadcrumb">
  <Breadcrumb.Item key="scope">医疗识别</Breadcrumb.Item>
  <Breadcrumb.Item key="page">{pageTitle}</Breadcrumb.Item>
</Breadcrumb>

// 新：
<Breadcrumb className="app-breadcrumb">
  <Breadcrumb.Item key="scope">{pageGroup}</Breadcrumb.Item>
  <Breadcrumb.Item key="page">{pageTitle}</Breadcrumb.Item>
</Breadcrumb>
```

- [ ] **步骤 4：提交**

```bash
git add medical-ui/src/layout/AppLayout.tsx
git commit -m "fix(ui): 面包屑导航显示模块分组名而非固定文案"
```

---

### 任务 5：构建验证 + 部署

- [ ] **步骤 1：前端构建**

```bash
cd /tmp/Medical-Record-Agent/medical-ui && npx vite build
```

预期：构建成功，无 TypeScript 错误，无 import 错误。

- [ ] **步骤 2：重启 API**

```bash
cd /tmp/Medical-Record-Agent && bash start-api.sh
```

- [ ] **步骤 3：重载 nginx**

```bash
sudo systemctl reload nginx
```

- [ ] **步骤 4：运行后端测试**

```bash
cd /tmp/Medical-Record-Agent && python -m pytest tests/ -v --tb=short 2>&1 | tail -30
```

预期：所有测试通过。

- [ ] **步骤 5：最终提交**

```bash
cd /tmp/Medical-Record-Agent && git add -A && git commit -m "Phase 7: P2优化项 - 上传区域优化/引导系统/面包屑修复"
```

---

## 验收检查清单

- [ ] 上传区域宽度 100%（无 maxWidth 限制）
- [ ] 拖拽区域 min-height: 200px，虚线边框，悬停变色
- [ ] 选择文件后 Toast "已选择 N 个文件"
- [ ] 移除文件后 Toast "已移除文件 xxx"
- [ ] Dashboard 任务数 ≤ 5 时显示引导区，> 5 时隐藏
- [ ] 引导区 3 个步骤卡片水平排列，步骤 1 有跳转按钮
- [ ] 面包屑显示「模块名 / 页面名」（如「质量保障 / 反馈管理」）
- [ ] 所有页面面包屑文字不为空
- [ ] 前端 build 通过
- [ ] 后端测试通过
- [ ] 生成 PHASE7-AUDIT.md 审计报告
