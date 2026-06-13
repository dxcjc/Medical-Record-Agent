# Medical Record Agent — 产品闭环优化方案

> 目标：从 Demo 状态升级为可用产品，补齐数据流闭环、管理能力、UI 体验。

---

## 总览：3 个 Phase，18 个任务

| Phase | 主题 | 任务数 | 核心目标 |
|-------|------|--------|----------|
| Phase 1 | 数据流 + 基础管理 | 8 | 外部系统能拿到数据，用户能管理任务 |
| Phase 2 | Schema + 知识库融合 | 4 | 字段卡片编辑器，RAG 知识按字段管理 |
| Phase 3 | 评测追溯 + 审计闭环 | 6 | 决策链路可追溯，质量可度量 |

---

## Phase 1: 数据能流出去 + 基础管理 (P0)

### 1.1 推送 API

**目标：** 外部系统（LIMS/HIS）能通过 API 拿到识别结果。

**新增端点：**
- `GET /api/v1/jobs` — 任务列表，支持 `?status=needs_review&schemaKey=tumor-gene-test&page=1&pageSize=20`
- `GET /api/v1/jobs/:id/result` — 标准化识别结果（含字段值、置信度、证据链）
- `GET /api/v1/jobs/:id/result/fields` — 精简版，只返回 `{ fieldKey: value }` 键值对
- `POST /api/v1/jobs/:id/review` — 提交复核结果（确认/修正字段值）

**认证：** API Key（长期有效，放在 `X-API-Key` Header），独立于 JWT。

**返回格式标准化：**
```json
{
  "jobId": "xxx",
  "schemaKey": "tumor-gene-test",
  "schemaVersion": 3,
  "status": "needs_review",
  "fields": [
    {
      "key": "patientName",
      "label": "患者姓名",
      "value": "王新",
      "rawValue": "王新",
      "confidence": 1.0,
      "decision": "accepted",
      "evidence": [
        { "snippet": "姓名：王新", "page": 1, "startOffset": 111, "endOffset": 117 }
      ]
    }
  ],
  "metadata": {
    "ocrProvider": "volces-vision",
    "llmProvider": "volces-seed-2-pro",
    "processingTimeMs": 4200,
    "ragEntriesUsed": 5
  }
}
```

### 1.2 API Key 管理

**新增页面：** `SettingsPage` 或 `ApiKeysPage`

| 功能 | 说明 |
|------|------|
| 创建 API Key | 输入名称，生成 key，只显示一次 |
| 查看列表 | 名称、前缀（`mra_xxxx`）、创建时间、最后使用时间、状态 |
| 吊销 | 禁用某个 key |

**数据模型：** 新增 `ApiKey` Prisma 模型（id, name, keyHash, prefix, active, lastUsedAt, createdById）。

### 1.3 任务 CRUD

| 操作 | 端点 | 说明 |
|------|------|------|
| 删除 | `DELETE /api/jobs/:id` | 软删除（标记 deleted），关联的 result/feedback 一并归档 |
| 重跑 | `POST /api/jobs/:id/rerun` | 用相同文件+Schema 重新创建任务 |
| 导出 JSON | `GET /api/jobs/:id/export?format=json` | 下载标准化结果 |
| 导出 CSV | `GET /api/jobs/:id/export?format=csv` | 字段值平铺为 CSV 行 |

**前端：** JobDetailPage 顶部操作栏加"删除"/"重跑"/"导出"按钮。JobListPage 支持批量选择+批量删除。

### 1.4 任务列表真分页 + 完整列

**后端改造：**
```
GET /api/jobs?page=1&pageSize=20&status=needs_review&schemaKey=tumor-gene-test&search=王新
```
返回 `{ items: [...], total: 156, page: 1, pageSize: 20 }`

**前端列显示（必须全部展示）：**

| 列名 | 字段 | 说明 |
|------|------|------|
| 任务 ID | id | 截断显示前 8 位，hover 全量 |
| Schema | schemaKey + displayName | 显示中文名，不是 key |
| 文件名 | sourceFile.originalName | 原始上传文件名 |
| 状态 | status | StatusTag 组件 |
| 整体置信度 | confidence | 百分比 + 颜色 |
| 识别字段数 | fieldCount | 已识别/总字段 |
| 需复核数 | reviewCount | 需复核字段数，0 不显示 |
| Provider | providerName | 显示中文名 |
| 耗时 | elapsedMs | 自动格式化 |
| 创建人 | createdBy.displayName | 操作人 |
| 创建时间 | createdAt | 相对时间 + hover 绝对时间 |
| 操作 | — | 详情/删除/重跑/导出 |

**筛选栏：** 状态下拉 + Schema 下拉 + 关键字搜索 + 时间范围。

### 1.5 Dashboard 统计 API

**新增端点：** `GET /api/stats/dashboard`

返回：
```json
{
  "today": { "total": 12, "completed": 8, "needsReview": 3, "failed": 1 },
  "week": { "total": 87, "avgConfidence": 0.89, "avgElapsedMs": 4200 },
  "bySchema": [
    { "schemaKey": "tumor-gene-test", "count": 70, "avgConfidence": 0.91 },
    { "schemaKey": "lims-clinical", "count": 17, "avgConfidence": 0.83 }
  ],
  "recentAlerts": [
    { "jobId": "xxx", "message": "置信度低于 60%", "createdAt": "..." }
  ]
}
```

**前端：** DashboardPage 的 4 个 KPI 卡片用这个 API，不再从 `useJobs(20)` 推算。

### 1.6 UI 显示名称中文化

**问题：** 页面上多处显示英文 key 而非中文名。

**修复清单：**
- JobListPage 的 Schema 列：显示 `displayName` 而非 `schemaKey`
- JobListPage 的 Provider 列：显示 provider 的 `displayName` 而非 key
- JobDetailPage 的任务信息：Schema 显示中文名
- SchemaPage 左侧列表：已经是中文名 ✅（不用改）
- 审计日志的操作人列：显示 `displayName` 而非 `userId`
- 状态标签：用中文（已完成/需复核/识别中/失败），不用英文

**实现方式：** 后端返回时 join `displayName`，前端直接显示。

### 1.7 Schema 字段显示优化

**问题：** Schema 定义表格只显示 key/label/type/required 4 列。

**SchemaPage 字段表格改为：**

| 列名 | 字段 | 说明 |
|------|------|------|
| 标签 | label | 中文名（如"患者姓名"） |
| Key | key | 英文标识（如 patientName） |
| 类型 | type | string/enum/list/date/... |
| 必填 | required | ✅ / — |
| 关键字段 | critical | ✅ / — |
| LIMS 映射 | adapterHints.limsTargetPath | 如 patient.name |
| 识别说明 | comments | 截断显示，hover 全量 |
| 枚举值 | enumMap | enum 类型显示映射列表 |

### 1.8 所有列表页面完整列展示

**原则：** 列表页必须把有业务意义的字段都列出来，不要只展示几个 demo 列。

**EvaluationPage 列补充：**
- 数据集列表：名称、状态、样本数、关联 Schema、创建人、创建时间
- 运行记录：数据集名、Provider、状态、指标摘要（exact_match/f1）、开始时间、耗时

**ProviderPage 卡片补充：**
- 名称、状态、类型（OCR/LLM）、默认标记、Key 前缀、健康状态、最后健康检查时间、创建时间

**AuditPage 列补充：**
- 时间、操作人（中文名）、操作类型、对象类型、对象 ID（可点击跳转）、结果、IP 地址

---

## Phase 2: Schema + 知识库融合 (P1)

### 2.1 Schema 字段卡片编辑器

**目标：** 把 SchemaPage 从只读表格升级为卡片流布局，每个字段一张卡片，卡片上集成字段属性 + RAG 知识 + 识别统计。

**整体布局：**
- 左侧栏不变（Schema 列表）
- 右侧从表格改为**按字段分组的卡片流**
- 分组依据：字段的业务归属（患者信息/送检信息/临床诊断/样本信息/检测项目/其他）
- 分组定义从 Schema definition 的 metadata 或约定的 group 字段读取

**单个字段卡片内容：**

```
┌──────────────────────────────────────────────────────┐
│  患者姓名 (patientName)                   [必填] [关键] │
│  ──────────────────────────────────────────────────── │
│  属性（直接编辑，不弹窗）                                │
│  标签: [患者姓名      ]  类型: [string ▾]               │
│  LIMS映射: [patient.name    ]                          │
│  识别说明: [________________] ← textarea，直接编辑       │
│  枚举值: (enum类型才显示) [male→男] [female→女] [+添加]  │
│  写回模式: [auto ▾]                                     │
│                                                        │
│  📖 关联知识 (2条)                              [+ 添加] │
│  ├ 姓名常见OCR错误 | keywords: 姓名,患者    [编辑][删除]│
│  └ 同音字纠错       | keywords: 同音,纠错    [编辑][删除]│
│  (知识条目 inline 编辑，点"编辑"展开表单)                │
│                                                        │
│  📊 识别统计 (最近 100 次)                               │
│  置信度均值: 0.92 | 识别率: 98% | 需复核: 12次           │
│  ⚠️ 常见错误:                                           │
│  · "王 新" → 空格问题 (3次)                             │
│  · "王新 " → 尾部空格 (2次)                             │
│  💡 [采纳建议 → 自动填入知识条目创建表单]                  │
└──────────────────────────────────────────────────────┘
```

**list 类型字段（检测项目）：** 卡片内嵌棋盘格编辑器，可增删枚举选项、拖拽排序。

**保存机制：** 字段属性修改 → 更新 Schema definition JSON → 发布新版本。知识条目修改 → 直接调 Knowledge API。

### 2.2 识别统计聚合 API

**新增端点：** `GET /api/stats/fields?schemaKey=tumor-gene-test&limit=100`

按字段聚合：
```json
{
  "fields": [
    {
      "key": "patientName",
      "label": "患者姓名",
      "totalRecognized": 100,
      "avgConfidence": 0.92,
      "reviewCount": 12,
      "correctionCount": 5,
      "commonErrors": [
        { "pattern": "空格问题", "rawValue": "王 新", "correctedValue": "王新", "count": 3 },
        { "pattern": "尾部空格", "rawValue": "王新 ", "correctedValue": "王新", "count": 2 }
      ]
    }
  ]
}
```

**数据来源：** 从 `RecognitionResult` 的 `normalizedFields` + `FeedbackSubmission` 聚合。

### 2.3 JobDetailPage 动态化

**去掉所有硬编码：**
- `FIELD_GROUPS` → 从 Schema definition 的 metadata/group 字段读取
- `FIELD_LABELS` → 从 Schema definition 的 label 字段读取
- `LUNG_TEST_ITEMS` / `GI_TEST_ITEMS` / `OTHER_TEST_ITEMS` → 从 Schema definition 的 enumOptions 或知识库读取
- `CheckboxMatrix` 的选项列表 → 从 Schema 动态获取

**实现：** JobDetailPage 加载时先获取 Schema definition，动态构建字段分组和标签映射。

### 2.4 CheckboxMatrix 高亮优化

**当前问题：** 选中项和未选中项视觉区分不够强。

**优化方案：**
- 选中项：蓝色实底 `#3370FF` + 白色文字 + ☑ 图标 + 粗体 + 蓝色边框
- 未选中项：灰色浅底 `#F7F8FA` + 灰色文字 + ☐ 图标 + 正常字重 + 灰色边框
- 选中项加微动画（scale 1.02）增强感知
- 整体间距加大（gap: 10px → 12px）

---

## Phase 3: 评测追溯 + 审计闭环 (P2)

### 3.1 JobDetailPage 追溯视图

**入口：** JobDetailPage 加 Tab 切换（"识别结果" / "追溯链路"）

**链路节点：**
1. **原始文件** — 文件名、大小、storageKey
2. **OCR 识别** — Provider、耗时、输出 blocks 数、关键 block 高亮
3. **RAG 知识检索** — 检索 query、命中条目列表（title + score）、未命中条目
4. **LLM 抽取** — Provider、模型、prompt 版本、token 用量、耗时、原始输出
5. **校验 & 决策** — 每个字段的 decision + issues + 置信度

**交互：** 每个节点可展开详情。点击字段值 → 高亮对应的 OCR block + RAG entry。

### 3.2 质量审计页

**新增页面或 Tab：** 在 AuditPage 加"质量报告" Tab。

**内容：**
- 时间范围选择器 + Schema 选择器
- 4 个 KPI 卡片（总任务、识别率、需复核率、平均耗时）
- 识别率趋势折线图（按天）
- 最常出错字段 TOP 5（点击跳转 Schema 字段卡片）
- 按 Schema 分布统计

**API：** `GET /api/stats/quality?days=7&schemaKey=xxx`

### 3.3 操作审计增强

**AuditPage 改造：**
- 加筛选栏（操作人/操作类型/时间范围/对象类型）
- 真分页（服务端分页）
- 行可展开看 metadata JSON
- 对象 ID 可点击跳转（任务 ID → JobDetailPage，Schema ID → SchemaPage）
- 操作类型显示中文（schema.publish → 发布 Schema，writeback.execute → 执行回写）

### 3.4 WritebackPage

**新增页面：** `/writeback`

- 可回写任务列表（`GET /writeback/eligible`）
- 每行显示：任务 ID、Schema、识别结果摘要、操作（回写/查看详情）
- 回写确认弹窗（预览将推送的字段值）
- 回写历史列表

### 3.5 FeedbackPage

**新增页面：** `/feedback`

- 全局反馈列表（跨任务）
- 按任务/字段/时间筛选
- 按字段统计：哪些字段反馈最多（最容易出错）
- 反馈详情：原始值 vs 修正值 + 原因

### 3.6 评测系统

**增强 EvaluationPage：**
- 创建数据集表单（名称 + 关联 Schema）
- 导入样本（上传 ground truth JSON/CSV）
- 创建评测运行（选择数据集 + Provider）
- 评测结果详情（字段级准确率/召回率/F1）
- 评测报告导出

---

## 全局问题修复（贯穿所有 Phase）

### G1. UI 显示名称中文化
- 所有列表/详情/标签显示中文名而非英文 key
- 状态标签用中文（已完成/需复核/识别中/失败）
- Provider 显示 displayName
- 操作人显示 displayName
- 操作类型显示中文

### G2. Schema 字段显示优化
- 字段表格增加列（label/key/type/required/critical/limsPath/comments/enumMap）
- 字段 label 作为主显示，key 作为辅助

### G3. 列表完整列展示
- JobListPage: 12 列（见 1.4）
- EvaluationPage: 数据集 6 列 + 运行记录 7 列
- ProviderPage: 卡片显示 8 个属性
- AuditPage: 7 列 + 筛选

---

## 实施顺序

```
Phase 1（预计 3-4 天）
  Day 1: 1.1 推送 API + 1.2 API Key 模型
  Day 2: 1.3 任务 CRUD + 1.4 列表分页
  Day 3: 1.5 Dashboard 统计 API + 1.6 显示名称中文化
  Day 4: 1.7 Schema 字段显示 + 1.8 列表完整列

Phase 2（预计 3-4 天）
  Day 5: 2.1 字段卡片编辑器（布局 + 属性编辑）
  Day 6: 2.1 字段卡片编辑器（知识条目管理 + 统计展示）
  Day 7: 2.2 统计聚合 API + 2.3 JobDetailPage 动态化
  Day 8: 2.4 CheckboxMatrix 高亮 + 整体联调

Phase 3（预计 4-5 天）
  Day 9:  3.1 追溯视图
  Day 10: 3.2 质量审计 + 3.3 操作审计增强
  Day 11: 3.4 WritebackPage + 3.5 FeedbackPage
  Day 12: 3.6 评测系统增强
  Day 13: 全局联调 + 回归测试
```

---

## 验收标准

每个 Phase 完成后：
1. `pnpm build` 构建通过
2. 所有新增 API 有对应的前端页面调用
3. 列表页完整列展示，无英文 key 直接显示
4. 字段卡片可编辑、知识条目可增删改
5. 统计数据从真实数据聚合，不是硬编码
6. 追溯链路完整展示决策过程
