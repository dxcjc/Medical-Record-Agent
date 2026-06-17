# 评估数据集执行规范

本文档约定病历识别 Agent 的评估数据集组织方式、标注字段和运行边界。目标是让真实脱敏病历样本和合成样本可以被稳定地加载、复核、回归和审计。

## 数据安全边界

- 真实病历样本必须先完成脱敏，再进入评估数据集。脱敏责任人在导入前必须确认样本中不包含姓名、证件号、手机号、住址、完整住院号、完整门诊号、完整条码号、精确出生日期、可回溯医院内部编号等 PHI/PII。
- 仓库中禁止提交原始 PHI/PII。禁止把真实病历原图、未脱敏 OCR 文本、未脱敏 PDF、未脱敏截图、未脱敏导出 JSON 放入 git。
- 真实样本的 `metadata.deidentified` 必须为 `true`。如果该字段缺失或为 `false`，评估导入和评估运行都必须拒绝该样本。
- 脱敏后的真实样本只允许保存在受控本地目录或内网对象存储中，并通过访问控制、审计日志和最小权限使用。
- 合成样本可以进入仓库和 CI，但样本内容必须是人工构造或程序生成，不能由真实患者信息替换少数字段后得到。

## 推荐目录结构

推荐把可提交的合成样本和不可提交的真实脱敏样本分开管理：

```text
evaluation-data
├── synthetic
│   ├── datasets
│   │   └── lims-clinical-info-ci.json
│   └── documents
│       └── sample-001.ocr.json
└── local-deidentified
    ├── datasets
    │   └── lims-clinical-info-local.json
    └── documents
        └── sample-真实脱敏-001.ocr.json
```

- `evaluation-data/synthetic`：可提交到仓库，用于单元测试、集成测试和 CI 回归。
- `evaluation-data/local-deidentified`：本地或内网受控目录，默认加入 `.gitignore`，不得提交。
- `datasets/*.json`：数据集清单，引用样本文档、schema、provider 约束和标注答案。
- `documents/*.ocr.json`：脱敏后的 OCR 文本块、页码、坐标和质量信息；如果必须引用图片或 PDF，只能引用受控存储对象 key，不能把真实文件放入仓库。

## Dataset 元数据字段

每个数据集文件必须包含以下顶层字段：

- `datasetId`：数据集稳定标识，建议使用业务可读前缀加版本号，例如 `lims-clinical-info-ci-v1`。
- `name`：数据集中文名称。
- `schemaId`：评估使用的字段 schema，例如 `lims-clinical-info`。
- `schemaVersion`：评估锁定的 schema 版本。
- `sourceType`：数据来源类型，取值为 `synthetic` 或 `real_deidentified`。
- `deidentified`：是否已脱敏。合成样本建议为 `true`；真实样本必须为 `true`。
- `storagePolicy`：存储策略，取值建议为 `git_safe`、`local_controlled` 或 `intranet_controlled`。
- `createdBy`：创建人或导入任务标识，不写真实患者或无关人员信息。
- `createdAt`：ISO 时间字符串。
- `reviewedBy`：脱敏或标注复核人标识，可用工号、角色名或内部账号，不写个人敏感信息。
- `reviewedAt`：复核时间。
- `samples`：样本数组。

真实脱敏数据集额外建议记录：

- `deidentificationMethod`：脱敏方式，例如 `manual_review`、`rule_based_masking`、`ocr_redaction_reviewed`。
- `deidentificationChecklist`：脱敏检查项结果，至少覆盖身份标识、联系方式、住址、院内编号、文件名和图片角标。
- `accessScope`：允许使用范围，例如 `local_evaluation_only` 或 `intranet_evaluation_only`。

## Sample metadata 字段

每个 `samples[]` 元素必须包含：

- `sampleId`：样本稳定标识。
- `documentRef`：脱敏文档引用。CI 合成样本可使用仓库相对路径；真实样本使用受控对象 key 或本地受控路径别名。
- `documentType`：文档类型，例如 `ocr_text`、`image`、`pdf`。
- `sourceType`：继承或明确标记 `synthetic` / `real_deidentified`。
- `deidentified`：样本级脱敏标记。真实样本必须为 `true`。
- `caseCategory`：样本类别，例如 `清晰扫描件`、`模糊图片`、`多页 PDF`、`字段缺失`、`字段冲突`。
- `qualityTags`：质量标签数组，例如 `["清晰", "单页", "证据完整"]`。
- `language`：文档语言，中文样本使用 `zh-CN`。
- `groundTruth`：字段标准答案数组。
- `needsReview`：样本整体是否应进入人工复核。
- `reviewReasons`：当 `needsReview=true` 时，说明复核原因。

## groundTruth 字段结构

`groundTruth` 是字段级标准答案数组。每个字段对象必须包含：

- `fieldKey`：字段 key，必须能在对应 schema 中找到。
- `label`：字段中文名称。
- `value`：标准答案原始值；未知、缺失或不适用时使用 `null`。
- `normalizedValue`：归一化答案；如果无需归一化，可以与 `value` 一致。
- `matchPolicy`：匹配口径，建议取值为 `exact`、`normalized`、`contains`、`set_equal`、`manual_accept`。
- `evidence`：证据标注数组。
- `needsReview`：字段级复核标记。
- `reviewReason`：字段级复核原因；当字段值冲突、证据不足、低置信、缺失但业务关键时必须填写。
- `notes`：标注说明，不写真实患者身份信息。

字段缺失和不适用的区别：

- `value=null` 且 `matchPolicy=exact`：病历中未出现该字段，模型也应识别为缺失。
- `value=null` 且 `matchPolicy=manual_accept`：该字段需人工结合上下文判断，自动指标只统计复核召回，不统计 exact match。
- 不适用字段必须在 `notes` 中写明“不适用原因”，避免被误判为漏抽。

## Evidence 标注方式

`evidence` 用来衡量模型输出是否能回到原文依据。每条证据建议包含：

- `text`：脱敏后的原文片段。必须是中文明文或原文中的非敏感缩写，不能包含真实 PHI/PII。
- `pageNumber`：页码，从 1 开始。
- `blockId`：OCR 文本块标识。
- `startOffset`：证据片段在 OCR block 文本中的起始位置，从 0 开始。
- `endOffset`：证据片段结束位置，左闭右开。
- `bbox`：可选坐标，格式为 `{ "x": 数值, "y": 数值, "width": 数值, "height": 数值 }`。
- `evidenceRole`：证据作用，建议取值为 `primary`、`supporting`、`conflict`、`negative`。

证据标注规则：

- 每个关键字段至少有一条 `primary` 证据。
- 如果同一字段多处出现且结论一致，可增加 `supporting` 证据。
- 如果病历中存在互相冲突的信息，保留冲突片段并标为 `conflict`，字段级 `needsReview` 必须为 `true`。
- 如果某字段应判断为未出现，可用 `negative` 证据说明已检查的章节或文本块；没有明确负证据时不要伪造证据。
- 坐标来自 OCR provider 时直接记录；没有坐标时可以省略 `bbox`，但不能填假坐标。

## needsReview 标注口径

`needsReview` 用于评估系统能否把不确定、冲突或高风险样本送入人工复核。标注口径如下：

- 关键字段缺失：例如临床诊断、癌种、样本类型、病史等关键字段缺失时，字段级和样本级都标记 `needsReview=true`。
- 证据不足：字段有值但缺少页码、原文片段或可定位证据时，字段级标记 `needsReview=true`。
- 低质量输入：OCR 文本断裂、图片模糊、多页顺序不明、关键区域遮挡时，样本级标记 `needsReview=true`。
- 多值冲突：同一字段在不同位置出现不一致结论时，字段级和样本级都标记 `needsReview=true`。
- 业务高风险：即使字段值可抽取，只要该字段会触发自动写回、诊疗判断或关键枚举归一，且标注人认为需要人工确认，也应标记 `needsReview=true`。
- 正常样本：字段证据完整、无冲突、输入质量可接受且不需要人工判断时，`needsReview=false`。

评估指标中，`needs_review_recall` 应按人工标注的 `needsReview=true` 样本或字段作为召回目标，检查系统是否输出了 `needs_review`、`low_confidence`、`conflict`、`missing_evidence` 等复核状态。

## Synthetic 与真实样本运行约定

- CI 只运行 synthetic samples。CI 不读取 `local-deidentified`、内网对象存储或任何真实样本路径。
- 自动化测试默认使用合成样本和测试替身，确保测试稳定、低成本、无外部依赖。
- 接入真实 OCR/LLM provider 的评估只能在受控本地或内网环境运行，并由显式配置开启。
- 公网 provider 原型评估不得直接发送真实病历原文；如需实验，只允许使用合成样本或经过审批的强脱敏文本。
- 真实脱敏样本评估运行必须记录 datasetId、schemaVersion、promptVersion、ocrProvider、modelProvider、运行人、运行时间和审计日志。
- 从人工反馈沉淀评估样本时，必须重新执行脱敏检查，不能把反馈 payload 直接写成真实样本。

## Manifest 校验脚本

真实脱敏样本导入前先用本地 manifest 脚本做预检：

```powershell
pnpm eval:manifest evaluation-data/local-deidentified/datasets/lims-clinical-info-local.json
```

脚本只读取 manifest 并输出校验摘要，不上传文件、不调用 OCR/LLM、不导入 API。当前会检查：

- 顶层 `datasetId`、`schemaId`、`schemaVersion`、`sourceType`、`deidentified`、`samples` 等必填字段。
- `sourceType=real` 直接拒绝；真实样本只能用 `real_deidentified`。
- `real_deidentified` 必须提供 `deidentification.proofId`，或提供 `reviewedBy` + `reviewedAt`。
- dataset 和 sample 都必须满足 `deidentified=true`。
- 每个样本必须有 `documentRef`、`documentType` 和字段级 `groundTruth`。
- 每个字段级 `groundTruth` 必须带 evidence。
- manifest 文本中如果出现手机号、身份证号、联系方式、住址、住院号、门诊号、条码号等明显 PHI/PII 风险，会阻止生成导入 payload。

通过校验后，manifest 可以由受控导入流程转换为 API 所需的 dataset 和 samples payload。转换后的 sample metadata 会保留 `sourceType=real_deidentified`、`deidentified=true`、脱敏证明、`documentRef`、`documentType`、质量标签和 `needsReview` 标注；后端导入接口仍会再次执行脱敏安全门校验。

## 短 JSON 示例

下面示例是合成样本，不包含真实个人信息。字段值保持中文明文，禁止使用 Unicode 转义。

```json
{
  "datasetId": "lims-clinical-info-ci-v1",
  "name": "LIMS 临床信息合成评估集",
  "schemaId": "lims-clinical-info",
  "schemaVersion": "1.0.0",
  "sourceType": "synthetic",
  "deidentified": true,
  "storagePolicy": "git_safe",
  "createdBy": "评估样本生成脚本",
  "createdAt": "2026-06-05T10:00:00.000+08:00",
  "reviewedBy": "评估员",
  "reviewedAt": "2026-06-05T10:30:00.000+08:00",
  "samples": [
    {
      "sampleId": "synthetic-sample-001",
      "documentRef": "evaluation-data/synthetic/documents/sample-001.ocr.json",
      "documentType": "ocr_text",
      "sourceType": "synthetic",
      "deidentified": true,
      "caseCategory": "清晰扫描件",
      "qualityTags": ["清晰", "单页", "证据完整"],
      "language": "zh-CN",
      "needsReview": false,
      "reviewReasons": [],
      "groundTruth": [
        {
          "fieldKey": "clinicalDiagnosis",
          "label": "临床诊断",
          "value": "肺腺癌",
          "normalizedValue": "肺腺癌",
          "matchPolicy": "normalized",
          "needsReview": false,
          "reviewReason": "",
          "notes": "合成病例，仅用于评估字段抽取。",
          "evidence": [
            {
              "text": "临床诊断：肺腺癌",
              "pageNumber": 1,
              "blockId": "block-001",
              "startOffset": 0,
              "endOffset": 9,
              "bbox": {
                "x": 120,
                "y": 88,
                "width": 180,
                "height": 28
              },
              "evidenceRole": "primary"
            }
          ]
        }
      ]
    }
  ]
}
```

## 导入前检查清单

- 确认真实样本文件、OCR 文本、文件名和路径别名均不包含 PHI/PII。
- 确认 dataset 和 sample 的 `deidentified` 均为 `true`。
- 确认真实样本不在 git staged set 中。
- 确认 synthetic samples 才能进入 CI。
- 确认测试和 CI 默认使用合成样本和测试替身。
- 确认每个关键字段有标准答案、匹配口径和证据标注。
- 确认 `needsReview` 标注覆盖关键字段缺失、证据不足、低质量输入、多值冲突和业务高风险场景。
