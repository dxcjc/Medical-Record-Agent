# 任务：重构肿瘤基因检测申请单的任务详情页

## 背景
当前任务详情页只显示扁平字段列表，没有按业务逻辑分组。需要重构为分组卡片布局，并实现勾选矩阵组件。

## 需要修改的文件
- `/tmp/Medical-Record-Agent/medical-ui/src/pages/JobDetailPage.tsx` - 主页面重构
- `/tmp/Medical-Record-Agent/medical-ui/src/components/CheckboxMatrix.tsx` - 新建勾选矩阵组件
- `/tmp/Medical-Record-Agent/medical-ui/src/components/FieldGroup.tsx` - 新建字段分组组件

## 具体需求

### 1. 任务详情页重构（JobDetailPage.tsx）

将当前的扁平字段列表改为 **6 个分组卡片**：

```
┌─────────────────────────────────────────────────────────────┐
│ 任务信息                                                      │
│ Schema: tumor-gene-test  │  Provider: http-ocr  │  状态: needs_review │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────────────┐  ┌──────────────────────────────┐
│ 患者信息                      │  │ 送检信息                      │
│ 姓名: 王新                    │  │ 送检医生: 贾文笑              │
│ 性别: 男                      │  │ 送检日期: 2026-05-14          │
│ 年龄: 55岁                    │  │ 病理号: 2022-21264            │
│ 门诊号: 0001957996            │  │ 样本编号: FZ2665269           │
│ 电话: 15554657666             │  │ 诊室: 胸部放疗知名专家门诊(4) │
│ 身份证号: 101010191571996     │  │                               │
│ 民族: 其他                    │  │                               │
└──────────────────────────────┘  └──────────────────────────────┘

┌──────────────────────────────┐  ┌──────────────────────────────┐
│ 临床诊断                      │  │ 样本信息                      │
│ 肿瘤类型: 肺腺癌              │  │ 标本类型: 手术标本、血液、石蜡 │
│ 肿瘤分类: 肺癌                │  │ 血液样本: 2my2(特殊取血部位)  │
│                               │  │ 制备时间: -                   │
│                               │  │ 肿瘤细胞含量: -               │
└──────────────────────────────┘  └──────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 检测项目（勾选矩阵）                                          │
│                                                              │
│ 肺癌检测项目:                                                │
│ ☑ 肿瘤9基因  ☐ 肿瘤13基因  ☑ 肺癌11基因  ☑ EGFR           │
│ ☐ 肿瘤40基因  ☐ 188基因  ☑ 1021基因  ☐ 肿瘤mrd(血液)      │
│ ☐ 实体瘤40基因                                               │
│                                                              │
│ 消化道肿瘤检测项目:                                          │
│ ☐ 肠癌3基因(+MSI)  ☐ MSI  ☐ UGT1A1  ☐ C-Kit              │
│ ☐ PDGFRA  ☐ 肠癌4基因(+MSI)  ☐ 胃癌18基因  ☐ 肿瘤18基因  │
│ ☐ 肿瘤40基因  ☐ 林奇综合征                                  │
│                                                              │
│ 其他检测项目:                                                │
│ ☑ Onco1021-MRD  ☐ OncoD肿瘤用药基因检测                    │
│ ☐ 同源重组修复缺陷基因检测  ☐ OncoMD肿瘤疗效基因监测        │
│ ☐ 脑胶质瘤基因检测  ☐ 肿瘤临床超级外显子组基因检测          │
│ ☐ 肿瘤融合基因检测  ☐ PD-L1 IHC检测  ☐ 淋巴瘤基因检测     │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────────────┐  ┌──────────────────────────────┐
│ 检测产品                      │  │ 其他信息                      │
│ 检测公司: Gene+吉因加         │  │ 输血史: 无                    │
│ 文件编号: GeneTA5-002         │  │                               │
│ 文件版本: V2.1                │  │                               │
└──────────────────────────────┘  └──────────────────────────────┘
```

### 2. 勾选矩阵组件（CheckboxMatrix.tsx）

**Props:**
```typescript
interface CheckboxMatrixProps {
  title: string;
  options: string[];  // 所有选项
  selected: string[]; // 已选选项
  confidence?: number;
  source?: string;    // 来源位置（如"第2页左下角"）
  onChange?: (selected: string[]) => void;  // 允许修改
}
```

**样式要求:**
- 已选选项：蓝色背景 (#3370FF)，白色文字，带勾选图标
- 未选选项：灰色背景 (#F7F8FA)，灰色文字
- 点击可切换选中状态
- 底部显示置信度和来源
- 支持键盘操作（Tab 切换，Space 选中）

### 3. 字段分组组件（FieldGroup.tsx）

**Props:**
```typescript
interface FieldGroupProps {
  title: string;
  icon?: React.ReactNode;
  fields: Array<{
    label: string;
    value: string | string[] | null;
    confidence?: number;
    source?: string;
  }>;
  columns?: 1 | 2;  // 列数
}
```

**样式要求:**
- 使用 Arco Design 的 Card + Descriptions 组件
- 低置信度字段（< 0.7）显示橙色警告图标
- 空字段显示为 "-"
- 支持响应式布局

### 4. 数据映射

从 API 返回的 `fields` 数组中，按 `fieldKey` 分组：

```typescript
const fieldGroups = {
  patientInfo: ['patientName', 'patientGender', 'patientAge', 'outpatientNo', 'phone', 'idNumber', 'ethnicity'],
  referralInfo: ['referringDoctor', 'referralDate', 'pathologyNo', 'sampleNo', 'clinicRoom'],
  clinicalDiagnosis: ['tumorType', 'tumorCategory'],
  sampleInfo: ['sampleType', 'bloodSample', 'samplePrepTime', 'tumorCellPercent'],
  testItems: ['testItemsLung', 'testItemsGI', 'testItemsOther'],  // 使用 CheckboxMatrix
  testProduct: ['testProvider', 'documentNo', 'documentVersion', 'transfusionHistory'],
};
```

### 5. 样式要求

使用 Arco Design 组件库 + CSS 变量主题系统：
- 主色：#3370FF
- 背景：#F7F8FA
- 卡片阴影：0 2px 8px rgba(0,0,0,0.08)
- 圆角：8px
- 字体：DM Sans + Noto Sans SC

### 6. 验证步骤

1. `cd /tmp/Medical-Record-Agent/medical-ui && pnpm build` 编译通过
2. 启动开发服务器预览效果
3. 用已有任务 `cmqbaaavt000bwm7edmsj96cs` 测试
4. 检查所有字段是否正确分组显示
5. 检查勾选矩阵是否正确显示已选/未选状态

### 7. 输出审计报告

完成后输出审计报告：
- 修改了哪些文件
- 每项改动的具体内容
- 编译/测试结果
- 是否有遗漏
