在 /tmp/Medical-Record-Agent 实现 Phase 2：Schema 字段卡片编辑器 + 知识库融合。

## 技术上下文
- 前端：medical-ui（React + Arco Design + Vite）
- 后端：apps/api（Fastify + Prisma）
- 数据库有 KnowledgeEntry 模型（fieldKeys: String[] 关联字段）
- 知识库已有 28 条 seed 数据
- Schema 定义在 definition JSON 的 fields 数组中

## Task 1: 字段卡片编辑器（SchemaPage.tsx）

改造 SchemaPage 右侧从表格改为卡片流布局。

按字段分组展示（患者信息/送检信息/临床诊断/样本信息/检测项目/其他）。
分组规则：
- patientName, patientGender, patientAge, outpatientNo, phone, idNumber, ethnicity → 患者信息
- referringDoctor, referralDate, pathologyNo, sampleNo, clinicRoom → 送检信息
- tumorType, tumorCategory → 临床诊断
- sampleType, bloodSample, samplePrepTime, tumorCellPercent → 样本信息
- testItemsLung, testItemsGI, testItemsOther, testProvider, documentNo, documentVersion → 检测信息
- transfusionHistory → 其他

每个字段卡片内容：
```
┌──────────────────────────────────────────────────────┐
│  患者姓名 (patientName)                   [必填] [关键] │
│  属性（直接 inline 编辑，不弹窗）                        │
│  标签: [患者姓名      ]  类型: [string ▾]               │
│  LIMS映射: [patient.name    ]                          │
│  识别说明: [________________] ← textarea               │
│  枚举值: (enum/list类型显示) [...]                       │
│                                                        │
│  📖 关联知识 (N条)                              [+ 添加] │
│  ├ 标题 | keywords: xx,yy                    [编辑][删除]│
│  └ ...                                                 │
│                                                        │
│  📊 识别统计                                             │
│  置信度均值: 0.92 | 识别率: 98% | 需复核: 12次           │
│  ⚠️ 常见错误: ...                                       │
│  💡 [采纳建议 → 自动填入知识条目创建表单]                  │
└──────────────────────────────────────────────────────┘
```

list 类型字段（testItemsLung/GI/Other）：卡片内用 CheckboxMatrix 展示枚举选项，支持增删。

## Task 2: 知识条目管理 API

在 apps/api/src/routes/knowledge.routes.ts 中实现 CRUD：
- GET /api/knowledge?fieldKey=xxx&kind=xxx — 列表，支持按字段和类型筛选
- POST /api/knowledge — 创建
- PUT /api/knowledge/:id — 更新
- DELETE /api/knowledge/:id — 删除

## Task 3: 识别统计聚合 API

新增 GET /api/stats/fields?schemaKey=tumor-gene-test

从 RecognitionResult + FeedbackSubmission 聚合每个字段的：
- totalRecognized, avgConfidence, reviewCount, correctionCount
- commonErrors（从 feedback 中的 originalValue→correctedValue 聚合出现次数最多的模式）

## Task 4: JobDetailPage 动态化

修改 medical-ui/src/pages/JobDetailPage.tsx：
- 去掉硬编码的 FIELD_GROUPS、FIELD_LABELS
- 从 Schema definition 动态读取字段分组和标签
- CheckboxMatrix 的选项从 Schema definition 的 enumOptions 读取
- 保留现有功能（图片查看器、置信度、进度条等）

## Task 5: CheckboxMatrix 高亮优化

修改 medical-ui/src/components/CheckboxMatrix.tsx：
- 选中项：蓝色实底 #3370FF + 白色文字 + ☑ 图标 + 粗体 + 蓝色边框
- 未选中项：灰色浅底 #F7F8FA + 灰色文字 + ☐ 图标 + 正常字重 + 灰色边框
- 间距加大 gap: 12px

## 验证
1. pnpm typecheck 通过
2. medical-ui pnpm build 通过
3. 审计报告写入 /tmp/Medical-Record-Agent/PHASE2-AUDIT.md

【重要】不要问问题，直接开始工作。
