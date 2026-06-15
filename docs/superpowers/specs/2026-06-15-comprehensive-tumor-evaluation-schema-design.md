# 肿瘤资料完整评估 Schema 设计

日期：2026-06-15

## 背景

桌面固定测试集 `固定测试集共45个样本` 覆盖病理报告、申请单、基因检测报告、药厂申请单、多页资料、手写/勾选/模糊/倾斜图片、手术分期、多部位诊断等场景。现有 `lims-clinical-info` schema 主要服务 LIMS 临床基础信息写回，字段范围不足以完整评估这批样本中的治疗史、手术史、用药、放疗、转移、多部位、多页聚合等业务信息。

因此新增一个独立评估 schema，用于固定测试集完整评估，不直接污染 LIMS 写回 schema。

## 目标

新增 `comprehensive-tumor-evaluation` schema，中文名为“肿瘤资料完整评估”，用于评估 OCR + LLM 结构化抽取能力。

该 schema 应覆盖：

- 文档类型和病例概览
- 临床/病理诊断
- 原发部位、原发灶状态和诊断确定性
- 多部位和转移信息
- TNM/病理分期
- 样本和基因检测信息
- 手术史、治疗史、用药史、放疗史、化疗史、靶向治疗史、免疫治疗史
- OCR 质量问题和需人工审核原因
- 多页资料最终病例摘要

## 非目标

- 不把该 schema 设置为默认生产识别 schema。
- 不在本阶段实现 LIMS 自动写回。
- 不在本阶段扩展 `CoreFieldType`，仍使用现有 `string | number | boolean | date | enum | list`。
- 不在本阶段完成全部 45 个样本的人工 ground truth 标注。

## 推荐方案

采用独立评估 schema，但该 schema 作为页面/数据库动态配置维护，而不是新增 TypeScript 内置 schema 文件。

- 配置文件草案：`docs/evaluation/comprehensive-tumor-evaluation.schema.json`
- 不新增：`packages/core/src/schemas/comprehensiveTumorEvaluationSchema.ts`
- 不修改：`packages/core/src/index.ts` 的 schema 导出
- key：`comprehensive-tumor-evaluation`
- label：`肿瘤资料完整评估`
- version：`1.0.0`
- evidencePolicy：
  - `required: true`
  - `minConfidence: 0.65`
  - `requireSourceText: true`
  - `requirePageReference: true`

置信度阈值低于 `lims-clinical-info` 的 0.78，原因是该评估 schema 包含手写、勾选、模糊图片、多页聚合和复杂诊断推理字段，应允许更多候选进入人工评估，同时必须保留证据。

页面新增 schema 的正式路径是：Schema 页面创建草稿 → 校验 → 发布为数据库中的 active SchemaVersion → 新建识别任务时通过 `schemaKey` 或 `schemaVersionId` 使用。代码内置 schema 仅用于默认 schema、官方稳定 schema 或测试 fixture，不作为业务新增 schema 的常规方式。

## 字段设计

### 文档与病例概览

| key | label | type | required | 说明 |
|---|---|---|---|---|
| `documentTypes` | 文档类型 | list | 是 | 病理报告、申请单、基因检测报告、病历资料、药厂申请单等 |
| `patientName` | 患者姓名 | string | 否 | 多页资料和期望截图匹配时使用 |
| `sourceOrganization` | 来源机构 | string | 否 | 医院、检测机构、药厂或报告来源 |
| `reportDate` | 报告日期 | date | 否 | 报告或资料形成日期 |
| `diagnosisDate` | 诊断日期 | date | 否 | 明确诊断日期；无明确日期时不强行输出 |

### 核心诊断

| key | label | type | required | 说明 |
|---|---|---|---|---|
| `clinicalDiagnosis` | 临床诊断 | string | 是 | 临床诊断或主要诊断原文 |
| `pathologicalDiagnosis` | 病理诊断 | string | 否 | 病理报告中的诊断结论 |
| `primaryTumorType` | 原发肿瘤类型 | string | 否 | 如肺腺癌、胃腺癌、乳腺癌、胶质瘤 |
| `primarySite` | 原发部位 | string | 否 | 肺、胃、乳腺、结直肠等 |
| `primarySiteStatus` | 原发灶状态 | enum | 否 | 明确、原发灶未明、疑似、未提及 |
| `diagnosisCertainty` | 诊断确定性 | enum | 否 | 确诊、疑似、排除、无法判断 |

`primarySiteStatus` 枚举：

- `confirmed`: 原发部位明确
- `unknownPrimary`: 原发灶未明
- `suspected`: 疑似原发部位
- `notMentioned`: 未提及

`diagnosisCertainty` 枚举：

- `confirmed`: 确诊
- `suspected`: 疑似
- `excluded`: 排除或否认
- `uncertain`: 无法判断

### 多部位与转移信息

| key | label | type | required | 说明 |
|---|---|---|---|---|
| `involvedSites` | 累及部位 | list | 否 | 多部位病灶、送检部位、病理累及部位 |
| `metastasisStatus` | 转移状态 | enum | 否 | 有转移、未见转移、疑似转移、未提及 |
| `metastasisSites` | 转移部位 | list | 否 | 肝、淋巴结、骨、肺等 |
| `multiPrimaryOrMultiSiteNote` | 多原发/多部位说明 | string | 否 | 多部位或复杂诊断原文摘要 |

`metastasisStatus` 枚举：

- `present`: 有转移
- `absent`: 未见转移
- `suspected`: 疑似转移
- `notMentioned`: 未提及

### 分期信息

| key | label | type | required | 说明 |
|---|---|---|---|---|
| `tumorStage` | 肿瘤分期 | string | 否 | 总体分期原文，如 IV 期、T2N1M0 |
| `tnmStage` | TNM 分期 | string | 否 | 完整 TNM 表达 |
| `tStage` | T 分期 | string | 否 | 只出现 T 分期时保留，不补造 N/M |
| `nStage` | N 分期 | string | 否 | 只出现 N 分期时保留，不补造 T/M |
| `mStage` | M 分期 | string | 否 | 远处转移分期 |
| `pathologicalStage` | 病理分期 | string | 否 | 病理学分期 |
| `stageEvidenceCompleteness` | 分期完整性 | enum | 否 | 完整、部分、未提及、无法判断 |

`stageEvidenceCompleteness` 枚举：

- `complete`: 完整分期
- `partial`: 部分分期
- `absent`: 未提及分期
- `unclear`: 无法判断

### 样本与检测信息

| key | label | type | required | 说明 |
|---|---|---|---|---|
| `sampleType` | 样本类型 | list | 否 | 组织、血液、胸水、石蜡切片等，可多选 |
| `sampleSite` | 取样部位 | string | 否 | 送检或取样部位 |
| `pathologyNo` | 病理号 | string | 否 | 病理报告或申请单中的病理号 |
| `sampleNo` | 样本编号 | string | 否 | 样本编号、检测编号等 |
| `geneTestItems` | 基因检测项目 | list | 否 | EGFR、NGS panel、MSI 等 |
| `geneMutationSummary` | 基因突变摘要 | string | 否 | 基因检测报告中的关键突变或结果摘要 |

### 治疗相关病史

| key | label | type | required | 说明 |
|---|---|---|---|---|
| `surgeryHistory` | 手术史 | string | 否 | 手术名称、时间或“有/无/不详” |
| `treatmentHistory` | 治疗史 | string | 否 | 资料中总体治疗史描述 |
| `medicationHistory` | 用药史 | list | 否 | 多药物列表或关键药物名称 |
| `radiotherapyHistory` | 放疗史 | string | 否 | 放疗相关描述 |
| `chemotherapyHistory` | 化疗史 | string | 否 | 化疗方案或化疗史 |
| `targetedTherapyHistory` | 靶向治疗史 | string | 否 | 靶向药物或靶向治疗史 |
| `immunotherapyHistory` | 免疫治疗史 | string | 否 | 免疫治疗药物或治疗史 |

### 评估辅助字段

| key | label | type | required | 说明 |
|---|---|---|---|---|
| `ocrQualityIssue` | OCR 质量问题 | enum | 否 | 模糊、倾斜、手写、多页顺序风险等 |
| `needsManualReviewReason` | 需人工审核原因 | list | 否 | 诊断冲突、分期不完整、原发灶未明、OCR 低质等 |
| `finalCaseSummary` | 病例摘要 | string | 否 | 多页资料聚合后的最终病例摘要 |

`ocrQualityIssue` 枚举：

- `none`: 无明显质量问题
- `blurry`: 图片模糊
- `skewed`: 图片倾斜
- `handwritten`: 手写内容较多
- `multipageOrderRisk`: 多页顺序风险
- `unreadable`: 无法识别
- `unclear`: 无法判断

## 测试集映射

| 测试组 | 主要覆盖字段 |
|---|---|
| 不同癌种解读匹配 | `primaryTumorType`, `clinicalDiagnosis`, `primarySite` |
| 不同类型病理报告 | `pathologicalDiagnosis`, `diagnosisCertainty`, `primarySiteStatus`, `metastasisStatus` |
| 上传不同类型图片 | `documentTypes`, `surgeryHistory`, `treatmentHistory`, `ocrQualityIssue` |
| 药厂测试 | `ocrQualityIssue`, `sampleType`, `clinicalDiagnosis` |
| 多资料样本测试 | `patientName`, `medicationHistory`, `finalCaseSummary`, `needsManualReviewReason` |
| 基因检测 | `geneTestItems`, `geneMutationSummary`, `sampleType`, `clinicalDiagnosis` |
| 手术分期 | `tumorStage`, `tnmStage`, `tStage`, `nStage`, `mStage`, `stageEvidenceCompleteness` |
| 多部位乳腺癌/多部位诊断 | `involvedSites`, `multiPrimaryOrMultiSiteNote`, `primarySite`, `metastasisSites` |

## 多张图片合并创建一个任务

当前系统允许一次选择多张图片，但提交时会为每张图片分别创建一个识别任务。固定测试集中存在多页病例资料、同一样本多张图片和“应该识别成这样”的期望截图，因此完整评估需要支持“多张输入图片合并为一个识别任务”。

新增能力应保持兼容：

- 继续支持单文件任务：`sourceFileId: string`。
- 新增多文件任务：`sourceFileIds: string[]`。
- 多文件任务按上传顺序执行 OCR，并将 OCR 文本合并为带页码/图片序号的上下文。
- 抽取阶段使用合并后的 OCR 文本执行一次字段抽取，得到一个病例级结果。
- 视觉增强在第一阶段可只对单文件任务保持现状；多文件任务必须至少保证 OCR 文本聚合正确，后续可扩展多图视觉输入。
- 任务列表和详情页至少能展示主文件或文件数量；完整多图预览可后续增强。

多文件任务的推荐数据流：

```text
sourceFileIds[]
  -> 逐个读取受控存储文件
  -> 转换为 OcrDocumentInput[]
  -> 逐个调用 OCR provider
  -> 按输入顺序合并 OCR 文本和 pages/blocks
  -> 对合并文本执行一次 extraction/validation/decision
  -> 保存一个 job/result
```

## 实现计划边界

本设计批准后的实现计划应包括：

1. 新增 `comprehensiveTumorEvaluationSchema.ts`。
2. 从 `packages/core/src/index.ts` 导出新 schema。
3. 在 schema validator 测试中验证新 schema 合法、key 稳定、枚举字段都有 enumMap。
4. 后端任务创建接口支持 `sourceFileIds`，并保持 `sourceFileId` 兼容。
5. 核心识别流程支持 `documents: OcrDocumentInput[]` 或等价聚合输入，按上传顺序合并 OCR 文本。
6. 前端新建任务页增加“合并为一个任务/分别创建任务”的选择；多图评估场景默认使用合并任务。
7. 建立固定测试集 manifest 草案，支持一个样本对应多张输入图片，先描述样本分组和输入文件，不在本阶段完成所有 ground truth 标注。
8. 后续将 manifest 转成 evaluation dataset，并通过 `schemaKey: comprehensive-tumor-evaluation` 执行完整评估。

## 自检

- 无待定字段；所有字段均使用当前框架支持的类型。
- 新 schema 独立于 LIMS 写回 schema，不改变默认生产 schema。
- 字段覆盖固定测试集中的诊断、病理、分期、样本、基因、治疗和 OCR 质量场景。
- 多部位和复杂诊断无法表达成嵌套结构，当前用 `list` 和说明性 `string` 保留信息，符合现有 `CoreSchemaDraft` 限制。
