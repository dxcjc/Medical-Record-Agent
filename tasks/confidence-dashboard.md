# 任务：实现置信度仪表盘（ConfidenceDashboard）

## 背景
复核人员需要快速了解识别结果的整体质量，特别是哪些字段置信度低需要重点关注。

## 需要修改的文件
- `/tmp/Medical-Record-Agent/medical-ui/src/components/ConfidenceDashboard.tsx` - 新建置信度仪表盘组件
- `/tmp/Medical-Record-Agent/medical-ui/src/pages/JobDetailPage.tsx` - 集成置信度仪表盘

## 具体需求

### 1. ConfidenceDashboard 组件

**Props:**
```typescript
interface ConfidenceDashboardProps {
  fields: Array<{
    key: string;
    label: string;
    value: string | null;
    confidence: number;
  }>;
  overallConfidence: number;
}
```

**功能要求:**

#### 1.1 整体置信度环形图
- 使用 Arco Design 的 Progress 组件（type="circle"）
- 颜色：≥80% 绿色、≥50% 橙色、<50% 红色
- 显示百分比和等级（高/中/低）

#### 1.2 置信度分布柱状图
- 按置信度区间分组：
  - 高（≥80%）：绿色
  - 中（50%-80%）：橙色
  - 低（<50%）：红色
- 显示每个区间的字段数量

#### 1.3 低置信度字段列表
- 只显示置信度 < 70% 的字段
- 按置信度从低到高排序
- 每个字段显示：
  - 字段名称
  - 当前值
  - 置信度（带颜色）
  - 建议操作（如"建议人工复核"）

#### 1.4 统计信息
- 总字段数
- 已填写字段数
- 空字段数
- 需要复核字段数（置信度 < 70%）

### 2. 集成到 JobDetailPage

在任务详情页的顶部（任务信息卡片下方）添加置信度仪表盘：
- 使用 Arco Design 的 Card 组件
- 标题："识别质量概览"
- 可折叠（默认展开）

### 3. 样式要求

- 使用 Arco Design 的 Progress、Tag、Statistic 组件
- 主色：#3370FF
- 背景：#F7F8FA
- 响应式：移动端改为单列布局

### 4. 验证步骤

1. `cd /tmp/Medical-Record-Agent/medical-ui && pnpm build` 编译通过
2. 用已有任务测试置信度显示
3. 检查低置信度字段是否正确高亮

### 5. 输出审计报告

完成后输出审计报告：
- 修改了哪些文件
- 每项改动的具体内容
- 编译/测试结果
- 是否有遗漏
