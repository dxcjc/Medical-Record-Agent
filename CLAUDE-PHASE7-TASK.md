# Phase 7 任务说明 — P2 优化项 + 引导系统

## 项目位置
`/tmp/Medical-Record-Agent`

## 重要：直接执行所有任务，不要问问题，不要只做计划！

---

## 任务 1：新建识别页面上传区域优化

### 改动文件
- `medical-ui/src/pages/NewRecognitionPage.tsx`

### 具体需求
1. 上传组件容器宽度 100%，不要只占中间一小块
2. 适当增加上传区域高度（min-height: 200px）
3. 拖拽区域有明显的虚线边框和悬停效果
4. 文件上传成功后显示全局 Toast："已选择 N 个文件"

---

## 任务 2：Dashboard 引导系统

### 改动文件
- `medical-ui/src/pages/DashboardPage.tsx`

### 具体需求
1. 在统计卡片下方增加「快速上手」区域
2. 3 个步骤卡片水平排列：
   - 步骤 1：「上传文档」— 图标 + 描述 + 跳转按钮
   - 步骤 2：「AI 识别」— 图标 + 描述
   - 步骤 3：「人工复核」— 图标 + 描述
3. 条件显示：任务数 > 5 时隐藏引导区域

---

## 任务 3：面包屑导航修复

### 改动文件
- 各页面的面包屑组件

### 具体需求
1. 反馈管理页面面包屑显示「质量保障 / 反馈管理」
2. 检查所有页面面包屑都有正确文字

---

## 任务 4：构建验证 + 提交

```bash
cd /tmp/Medical-Record-Agent/medical-ui && npx tsc --noEmit && npx vite build
cd /tmp/Medical-Record-Agent && git add -A && git commit -m "Phase 7: P2优化项 - 上传区域优化/引导系统/面包屑修复" && git push
```

完成后生成 `/tmp/Medical-Record-Agent/PHASE7-AUDIT.md` 审计报告。
