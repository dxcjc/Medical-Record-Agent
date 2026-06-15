# 肿瘤完整评估 Schema 与多图任务实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 提供可通过页面/数据库发布的 `comprehensive-tumor-evaluation` 完整评估 schema JSON，并支持多张图片合并创建一个病例级识别任务。

**架构：** schema 作为 `CoreSchemaDraft` JSON 配置维护，不新增 TypeScript 内置 schema 文件；通过现有 Schema 页面或 Schema API 发布到数据库。识别链路保持现有单文件任务兼容，新增 `sourceFileIds` 输入和多文档聚合执行路径：后端将多文件按上传顺序转换为 `OcrDocumentInput[]`，核心层逐张 OCR 后合并文本和页码，再执行一次字段抽取；前端提供“合并为一个任务/分别创建任务”的选择。

**技术栈：** TypeScript、Fastify、Zod、Prisma、React、Arco Design、Vitest、pnpm workspace。

---

## 文件结构

### 新增文件

- `docs/evaluation/comprehensive-tumor-evaluation.schema.json`
  - 完整评估 schema 的 `CoreSchemaDraft` JSON 配置。
  - 用于页面导入、API 创建草稿、发布为数据库 SchemaVersion。
  - 不新增 `packages/core/src/schemas/comprehensiveTumorEvaluationSchema.ts`。

- `docs/evaluation/comprehensive-tumor-evaluation.schema.test.mjs`
  - 读取 schema JSON。
  - 调用 core 构建产物里的 `validateCoreSchemaDraftInput` 校验合法性。

- `docs/evaluation/fixed-medical-image-set-2026-06-15.manifest.json`
  - 固定测试集 manifest 草案。
  - 支持一个样本对应多张输入图片和期望截图。

### 修改文件

- `packages/core/src/engine/documentPipeline.ts`
  - 新增多文档 OCR 聚合函数。
  - 保留现有单文档 `runDocumentPipeline`。

- `packages/core/src/engine/jobOrchestrator.ts`
  - 扩展 `JobOrchestratorInput`，允许 `documents?: OcrDocumentInput[]`。
  - 保持 `document: OcrDocumentInput` 兼容。

- `packages/core/src/engine/langgraphRecognitionWorkflow.ts`
  - OCR 节点优先处理 `documents`，否则走现有 `document`。
  - 多文档模式暂不传单张 `imageBase64`。

- `packages/core/test/jobOrchestrator.test.ts`
  - 增加多文档 OCR 合并与一次抽取测试。

- `apps/api/src/routes/route-dtos.ts`
  - `recognitionJobRouteInputSchema` 新增 `sourceFileIds?: string[]`。
  - 校验 `sourceFileId` 和 `sourceFileIds` 不能同时使用。

- `apps/api/src/routes/jobs.routes.ts`
  - service input 类型允许 `sourceFileIds` 和 `documents`。

- `apps/api/src/services/api-services.ts`
  - 创建任务时支持 `sourceFileIds`。
  - 每个文件转换为 `OcrDocumentInput`。
  - 创建一个 job，`sourceFileId` 填第一张，完整列表保存到 `options.sourceFileIds`，避免本阶段 Prisma 迁移。
  - 重跑任务时从 `options.sourceFileIds` 恢复多文件输入。

- `apps/api/src/routes/jobs.routes.test.ts`
  - 增加 `sourceFileIds` route payload 测试。

- `apps/api/src/services/api-services.test.ts`
  - 增加多文件创建与多文件重跑测试。

- `medical-ui/src/api/client.ts`
  - `jobsApi.create` body 支持 `sourceFileIds`。

- `medical-ui/src/api/types.ts`
  - `RecognitionJob` 支持可选 `sourceFileIds`；仍可从 `options.sourceFileIds` 读取。

- `medical-ui/src/pages/NewRecognitionPage.tsx`
  - 增加“合并为一个任务 / 每个文件分别创建任务”的模式选择。
  - 合并模式下先全部上传，再调用一次 `jobsApi.create({ sourceFileIds })`。

- `medical-ui/src/pages/JobDetailPage.tsx`
  - 显示源文件数量。

---

## 任务 1：新增动态完整评估 Schema JSON

**文件：**
- 创建：`docs/evaluation/comprehensive-tumor-evaluation.schema.json`
- 创建：`docs/evaluation/comprehensive-tumor-evaluation.schema.test.mjs`

- [ ] **步骤 1：编写失败的 schema JSON 校验脚本**

创建 `docs/evaluation/comprehensive-tumor-evaluation.schema.test.mjs`：

```js
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateCoreSchemaDraftInput } from "../../packages/core/dist/schemas/schemaValidator.js";

const schemaPath = resolve("docs/evaluation/comprehensive-tumor-evaluation.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const result = validateCoreSchemaDraftInput(schema);

if (!result.valid) {
  console.error(JSON.stringify(result.errors, null, 2));
  process.exit(1);
}

if (schema.key !== "comprehensive-tumor-evaluation") {
  console.error(`Unexpected schema key: ${schema.key}`);
  process.exit(1);
}

console.log("comprehensive tumor evaluation schema ok");
```

- [ ] **步骤 2：运行脚本验证失败**

运行：

```bash
pnpm --filter @medical-record-agent/core build
node docs/evaluation/comprehensive-tumor-evaluation.schema.test.mjs
```

预期：FAIL，报错 `ENOENT`，因为 schema JSON 尚未创建。

- [ ] **步骤 3：创建 schema JSON**

创建 `docs/evaluation/comprehensive-tumor-evaluation.schema.json`，内容为合法 `CoreSchemaDraft`：

```json
{
  "key": "comprehensive-tumor-evaluation",
  "label": "肿瘤资料完整评估",
  "version": "1.0.0",
  "evidencePolicy": {
    "required": true,
    "minConfidence": 0.65,
    "requireSourceText": true,
    "requirePageReference": true
  },
  "fields": [
    {
      "key": "documentTypes",
      "label": "文档类型",
      "type": "list",
      "required": true,
      "comments": ["识别输入资料类型，例如病理报告、申请单、基因检测报告、病历资料、药厂申请单。"],
      "adapterHints": { "limsTargetPath": "evaluation.documentTypes", "normalizer": "listField", "writebackMode": "preview" }
    },
    {
      "key": "patientName",
      "label": "患者姓名",
      "type": "string",
      "comments": ["从多页资料、申请单或报告抬头中提取患者姓名；注意不要误取医生姓名。"],
      "adapterHints": { "limsTargetPath": "evaluation.patientName", "writebackMode": "preview" }
    },
    {
      "key": "clinicalDiagnosis",
      "label": "临床诊断",
      "type": "string",
      "required": true,
      "comments": ["提取临床诊断或主要诊断原文；多诊断时保留主要诊断及上下文。"],
      "adapterHints": { "limsTargetPath": "evaluation.clinicalDiagnosis", "writebackMode": "preview" }
    },
    {
      "key": "pathologicalDiagnosis",
      "label": "病理诊断",
      "type": "string",
      "comments": ["提取病理报告中的最终诊断结论；不要把镜下描述当作最终诊断。"],
      "adapterHints": { "limsTargetPath": "evaluation.pathologicalDiagnosis", "writebackMode": "preview" }
    },
    {
      "key": "primaryTumorType",
      "label": "原发肿瘤类型",
      "type": "string",
      "comments": ["提取或推断原发肿瘤类型，例如肺腺癌、胃腺癌、乳腺癌、胶质瘤。"],
      "adapterHints": { "limsTargetPath": "evaluation.primaryTumorType", "writebackMode": "preview" }
    },
    {
      "key": "primarySiteStatus",
      "label": "原发灶状态",
      "type": "enum",
      "enumMap": {
        "confirmed": "原发部位明确",
        "unknownPrimary": "原发灶未明",
        "suspected": "疑似原发部位",
        "notMentioned": "未提及"
      },
      "comments": ["根据报告是否明确原发部位进行分类；原发灶未明必须保留原文证据。"],
      "adapterHints": { "limsTargetPath": "evaluation.primarySiteStatus", "writebackMode": "preview" }
    },
    {
      "key": "diagnosisCertainty",
      "label": "诊断确定性",
      "type": "enum",
      "enumMap": {
        "confirmed": "确诊",
        "suspected": "疑似",
        "excluded": "排除或否认",
        "uncertain": "无法判断"
      },
      "comments": ["区分确诊、疑似、排除和无法判断；优先以最终诊断段落为准。"],
      "adapterHints": { "limsTargetPath": "evaluation.diagnosisCertainty", "writebackMode": "preview" }
    },
    {
      "key": "involvedSites",
      "label": "累及部位",
      "type": "list",
      "comments": ["提取多部位病灶、送检部位或病理累及部位。"],
      "adapterHints": { "limsTargetPath": "evaluation.involvedSites", "normalizer": "listField", "writebackMode": "preview" }
    },
    {
      "key": "metastasisStatus",
      "label": "转移状态",
      "type": "enum",
      "enumMap": {
        "present": "有转移",
        "absent": "未见转移",
        "suspected": "疑似转移",
        "notMentioned": "未提及"
      },
      "comments": ["识别是否存在转移；不要把送检部位误判为转移部位。"],
      "adapterHints": { "limsTargetPath": "evaluation.metastasisStatus", "writebackMode": "preview" }
    },
    {
      "key": "metastasisSites",
      "label": "转移部位",
      "type": "list",
      "comments": ["提取明确转移部位，例如肝、淋巴结、骨、肺。"],
      "adapterHints": { "limsTargetPath": "evaluation.metastasisSites", "normalizer": "listField", "writebackMode": "preview" }
    },
    {
      "key": "tumorStage",
      "label": "肿瘤分期",
      "type": "string",
      "comments": ["提取总体分期原文，例如 IV 期、T2N1M0。"],
      "adapterHints": { "limsTargetPath": "evaluation.tumorStage", "writebackMode": "preview" }
    },
    {
      "key": "tnmStage",
      "label": "TNM 分期",
      "type": "string",
      "comments": ["提取完整 TNM 表达；不要补造不存在的 T/N/M 信息。"],
      "adapterHints": { "limsTargetPath": "evaluation.tnmStage", "writebackMode": "preview" }
    },
    {
      "key": "tStage",
      "label": "T 分期",
      "type": "string",
      "comments": ["只出现 T 分期时保留 T 分期，不补造 N/M。"],
      "adapterHints": { "limsTargetPath": "evaluation.tStage", "writebackMode": "preview" }
    },
    {
      "key": "nStage",
      "label": "N 分期",
      "type": "string",
      "comments": ["只出现 N 分期时保留 N 分期，不补造 T/M。"],
      "adapterHints": { "limsTargetPath": "evaluation.nStage", "writebackMode": "preview" }
    },
    {
      "key": "stageEvidenceCompleteness",
      "label": "分期完整性",
      "type": "enum",
      "enumMap": {
        "complete": "完整分期",
        "partial": "部分分期",
        "absent": "未提及分期",
        "unclear": "无法判断"
      },
      "comments": ["评估分期证据是否完整；未提及时必须输出 absent 或不产出候选，不得幻觉。"],
      "adapterHints": { "limsTargetPath": "evaluation.stageEvidenceCompleteness", "writebackMode": "preview" }
    },
    {
      "key": "sampleType",
      "label": "样本类型",
      "type": "list",
      "comments": ["提取组织、血液、胸水、石蜡切片等样本类型；可多选。"],
      "adapterHints": { "limsTargetPath": "evaluation.sampleType", "normalizer": "listField", "writebackMode": "preview" }
    },
    {
      "key": "geneTestItems",
      "label": "基因检测项目",
      "type": "list",
      "comments": ["提取 EGFR、NGS panel、MSI 等检测项目。"],
      "adapterHints": { "limsTargetPath": "evaluation.geneTestItems", "normalizer": "listField", "writebackMode": "preview" }
    },
    {
      "key": "surgeryHistory",
      "label": "手术史",
      "type": "string",
      "comments": ["提取手术名称、时间或有/无/不详。"],
      "adapterHints": { "limsTargetPath": "evaluation.surgeryHistory", "writebackMode": "preview" }
    },
    {
      "key": "treatmentHistory",
      "label": "治疗史",
      "type": "string",
      "comments": ["提取总体治疗史描述；勾选治疗史但具体不详时应输出具体不详。"],
      "adapterHints": { "limsTargetPath": "evaluation.treatmentHistory", "writebackMode": "preview" }
    },
    {
      "key": "medicationHistory",
      "label": "用药史",
      "type": "list",
      "comments": ["提取多药物列表或关键药物名称。"],
      "adapterHints": { "limsTargetPath": "evaluation.medicationHistory", "normalizer": "listField", "writebackMode": "preview" }
    },
    {
      "key": "radiotherapyHistory",
      "label": "放疗史",
      "type": "string",
      "comments": ["提取放疗相关描述。"],
      "adapterHints": { "limsTargetPath": "evaluation.radiotherapyHistory", "writebackMode": "preview" }
    },
    {
      "key": "ocrQualityIssue",
      "label": "OCR 质量问题",
      "type": "enum",
      "enumMap": {
        "none": "无明显质量问题",
        "blurry": "图片模糊",
        "skewed": "图片倾斜",
        "handwritten": "手写内容较多",
        "multipageOrderRisk": "多页顺序风险",
        "unreadable": "无法识别",
        "unclear": "无法判断"
      },
      "comments": ["根据 OCR 文本和质量告警判断主要质量问题。"],
      "adapterHints": { "limsTargetPath": "evaluation.ocrQualityIssue", "writebackMode": "preview" }
    },
    {
      "key": "needsManualReviewReason",
      "label": "需人工审核原因",
      "type": "list",
      "comments": ["列出需要人工审核的原因，例如诊断冲突、分期不完整、原发灶未明、OCR 低质。"],
      "adapterHints": { "limsTargetPath": "evaluation.needsManualReviewReason", "normalizer": "listField", "writebackMode": "preview" }
    },
    {
      "key": "finalCaseSummary",
      "label": "病例摘要",
      "type": "string",
      "comments": ["多页资料聚合后的最终病例摘要，保留关键信息和冲突点。"],
      "adapterHints": { "limsTargetPath": "evaluation.finalCaseSummary", "writebackMode": "preview" }
    }
  ]
}
```

- [ ] **步骤 4：运行脚本验证通过**

运行：

```bash
pnpm --filter @medical-record-agent/core build
node docs/evaluation/comprehensive-tumor-evaluation.schema.test.mjs
```

预期输出：

```text
comprehensive tumor evaluation schema ok
```

- [ ] **步骤 5：Commit**

如果用户已授权提交，运行：

```bash
git add docs/evaluation/comprehensive-tumor-evaluation.schema.json docs/evaluation/comprehensive-tumor-evaluation.schema.test.mjs
git commit -m "docs(evaluation): add comprehensive tumor schema config"
```

---

## 任务 2：核心层支持多文档 OCR 聚合

**文件：**
- 修改：`packages/core/src/engine/documentPipeline.ts`
- 修改：`packages/core/src/engine/jobOrchestrator.ts`
- 修改：`packages/core/src/engine/langgraphRecognitionWorkflow.ts`
- 测试：`packages/core/test/jobOrchestrator.test.ts`

- [ ] **步骤 1：编写失败测试**

在 `packages/core/test/jobOrchestrator.test.ts` 添加测试：创建两个 `OcrDocumentInput`，mock OCR provider 分别返回 `OCR text for doc-1` 和 `OCR text for doc-2`，mock model provider 记录收到的 `request.ocrText`。调用：

```ts
await orchestrator.start({
  jobId: "job-multi-doc",
  document: { documentId: "fallback", fileName: "fallback.png", mimeType: "image/png", content: new Uint8Array([1]) },
  documents: [
    { documentId: "doc-1", fileName: "1.png", mimeType: "image/png", content: new Uint8Array([1]) },
    { documentId: "doc-2", fileName: "2.png", mimeType: "image/png", content: new Uint8Array([2]) }
  ]
});
```

断言：

```ts
expect(ocrInputs).toEqual(["doc-1", "doc-2"]);
expect(seenOcrText).toContain("[文件 1: 1.png]");
expect(seenOcrText).toContain("OCR text for doc-1");
expect(seenOcrText).toContain("[文件 2: 2.png]");
expect(seenOcrText).toContain("OCR text for doc-2");
```

- [ ] **步骤 2：运行测试验证失败**

```bash
pnpm --filter @medical-record-agent/core test -- jobOrchestrator
```

预期：FAIL，`documents` 类型不存在或 OCR 仍只处理 fallback document。

- [ ] **步骤 3：新增多文档 pipeline**

在 `documentPipeline.ts` 新增：

```ts
export async function runMultiDocumentPipeline(input: {
  provider: OcrProvider;
  documents: readonly OcrDocumentInput[];
}): Promise<DocumentPipelineOutput> {
  const outputs = [] as Array<{ index: number; document: OcrDocumentInput; result: OcrResult }>;

  for (let index = 0; index < input.documents.length; index += 1) {
    const document = input.documents[index];
    outputs.push({ index, document, result: await input.provider.recognize(document) });
  }

  const pages = outputs.flatMap(({ index, document, result }) =>
    result.pages.map((page) => ({
      ...page,
      pageNumber: index + 1,
      text: `[文件 ${index + 1}: ${document.fileName ?? document.documentId}]\n${page.text}`
    }))
  );

  return {
    ocrResult: {
      providerName: outputs[0]?.result.providerName ?? input.provider.providerName,
      pages,
      blocks: outputs.flatMap(({ index, result }) => result.blocks.map((block) => ({ ...block, pageNumber: index + 1 }))),
      qualityWarnings: outputs.flatMap(({ index, document, result }) =>
        (result.qualityWarnings ?? []).map((warning) => `[文件 ${index + 1}: ${document.fileName ?? document.documentId}] ${warning}`)
      )
    },
    ocrText: pages.map((page) => page.text).join("\n\n")
  };
}
```

如果项目实际 `OcrPage` 字段不是 `pageNumber`，按 `providerTypes.ts` 调整。

- [ ] **步骤 4：扩展 orchestrator 输入和 workflow**

`jobOrchestrator.ts`：

```ts
export interface JobOrchestratorInput {
  jobId: string;
  schemaKey?: string;
  document: OcrDocumentInput;
  documents?: readonly OcrDocumentInput[];
  providerConfig?: {
    ocrProviderKey?: string;
    providerKey?: string;
  };
}
```

`langgraphRecognitionWorkflow.ts`：

```ts
import { runDocumentPipeline, runMultiDocumentPipeline } from "./documentPipeline";
```

OCR 节点：

```ts
const result = state.documents && state.documents.length > 0
  ? await runMultiDocumentPipeline({ provider: config.ocrProvider, documents: state.documents })
  : await runDocumentPipeline({ provider: config.ocrProvider, document: state.document });
```

extraction 节点：

```ts
const imageBase64 = !state.documents?.length && state.document.content
  ? Buffer.from(state.document.content).toString("base64")
  : undefined;
```

- [ ] **步骤 5：运行测试验证通过**

```bash
pnpm --filter @medical-record-agent/core test -- jobOrchestrator
```

预期：PASS。

---

## 任务 3：API 创建任务支持 sourceFileIds

**文件：**
- 修改：`apps/api/src/routes/route-dtos.ts`
- 修改：`apps/api/src/routes/jobs.routes.ts`
- 修改：`apps/api/src/services/api-services.ts`
- 测试：`apps/api/src/routes/jobs.routes.test.ts`
- 测试：`apps/api/src/services/api-services.test.ts`

- [ ] **步骤 1：route 测试**

新增测试：POST `/jobs` payload 包含：

```json
{
  "schemaKey": "lims-clinical-info",
  "sourceFileIds": ["file-1", "file-2"]
}
```

断言 `jobService.create` 收到：

```ts
expect.objectContaining({ sourceFileIds: ["file-1", "file-2"] })
```

- [ ] **步骤 2：运行 route 测试验证失败**

```bash
pnpm --filter @medical-record-agent/api test -- jobs.routes
```

预期：FAIL，`sourceFileIds` 被 Zod `.strip()` 丢弃。

- [ ] **步骤 3：扩展 DTO**

在 `route-dtos.ts`：

```ts
const sourceFileIdsRouteInputSchema = z.array(nonEmptyString).min(1).max(50).optional();

export const recognitionJobRouteInputSchema = z
  .object({
    schemaKey: optionalNonEmptyString,
    schemaVersionId: optionalNonEmptyString,
    sourceFileId: optionalNonEmptyString,
    sourceFileIds: sourceFileIdsRouteInputSchema,
    document: recognitionDocumentRouteInputSchema.optional(),
    options: jsonObjectSchema.optional(),
    providerConfig: recognitionProviderConfigRouteInputSchema.optional()
  })
  .strip()
  .superRefine((value, context) => {
    if (value.sourceFileId && value.sourceFileIds?.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sourceFileId and sourceFileIds cannot be used together",
        path: ["sourceFileIds"]
      });
    }
  });
```

- [ ] **步骤 4：扩展 service 类型**

在 `jobs.routes.ts`：

```ts
export type CreateRecognitionJobServiceInput = Omit<CreateRecognitionJobRouteInput, "document"> & {
  document?: RecognitionJobDocumentServiceInput | undefined;
  documents?: RecognitionJobDocumentServiceInput[] | undefined;
};
```

- [ ] **步骤 5：service 测试**

新增测试：`jobService.create({ schemaKey, sourceFileIds: ["file-1", "file-2"] })` 只创建一个 job，断言：

```ts
expect(result.sourceFileId).toBe("file-1");
expect(result.options).toMatchObject({ sourceFileIds: ["file-1", "file-2"] });
expect(orchestrator.start).toHaveBeenCalledWith(expect.objectContaining({
  documents: [expect.objectContaining({ documentId: "file-1" }), expect.objectContaining({ documentId: "file-2" })]
}));
```

- [ ] **步骤 6：实现 service create**

在 `api-services.ts` `jobService.create` 中读取 `sourceFileIds?: string[]`：

```ts
const sourceFileIds = body.sourceFileIds?.length ? body.sourceFileIds : undefined;
const preparedDocuments = sourceFileIds
  ? await Promise.all(sourceFileIds.map((sourceFileId) => createStoredFileDocumentInput({
      sourceFileId,
      document: { documentId: sourceFileId },
      fileRepository: repositories.fileRepository,
      storageProvider: options.storageProvider
    })))
  : undefined;
```

创建 job：

```ts
const mergedOptions = sourceFileIds
  ? { ...(isRecord(body.options) ? body.options : {}), sourceFileIds }
  : body.options;

const job = await repositories.jobsRepository.create({
  schemaKey,
  schemaVersionId: body.schemaVersionId ?? null,
  sourceFileId: sourceFileIds?.[0] ?? body.sourceFileId ?? null,
  createdById: body.createdById ?? null,
  options: toInputJsonValue(mergedOptions),
  providerConfig: toInputJsonValue(body.providerConfig)
});
```

传 orchestrator：

```ts
if (preparedDocuments) {
  orchestratorInput.documents = preparedDocuments;
}
```

- [ ] **步骤 7：运行测试验证通过**

```bash
pnpm --filter @medical-record-agent/api test -- jobs.routes api-services
```

预期：PASS。

---

## 任务 4：重跑任务支持多文件

**文件：**
- 修改：`apps/api/src/services/api-services.ts`
- 测试：`apps/api/src/services/api-services.test.ts`

- [ ] **步骤 1：编写失败测试**

创建一个原任务：

```ts
{
  id: "job-1",
  schemaKey: "lims-clinical-info",
  sourceFileId: "file-1",
  options: { sourceFileIds: ["file-1", "file-2"] },
  providerConfig: {},
  schemaVersionId: null
}
```

调用 `jobService.rerun("job-1")`，断言 orchestrator 收到两个 documents。

- [ ] **步骤 2：运行测试验证失败**

```bash
pnpm --filter @medical-record-agent/api test -- api-services
```

预期：FAIL，rerun 只使用 `sourceFileId`。

- [ ] **步骤 3：实现 rerun 多文件恢复**

读取原任务 options：

```ts
const originalOptions = isRecord(original.options) ? original.options : {};
const originalSourceFileIds = Array.isArray(originalOptions.sourceFileIds)
  ? originalOptions.sourceFileIds.filter((id): id is string => typeof id === "string" && id.length > 0)
  : [];
```

如果 `originalSourceFileIds.length > 0`，重建 documents 并传给 orchestrator；否则保留旧单文件逻辑。

- [ ] **步骤 4：运行测试验证通过**

```bash
pnpm --filter @medical-record-agent/api test -- api-services
```

预期：PASS。

---

## 任务 5：前端新建任务支持合并模式

**文件：**
- 修改：`medical-ui/src/api/client.ts`
- 修改：`medical-ui/src/api/types.ts`
- 修改：`medical-ui/src/pages/NewRecognitionPage.tsx`

- [ ] **步骤 1：扩展 API client**

`jobsApi.create` body 改为：

```ts
{
  schemaKey: string;
  sourceFileId?: string;
  sourceFileIds?: string[];
  schemaVersionId?: string;
  providerConfig?: import('./types').ProviderConfigMap;
}
```

- [ ] **步骤 2：扩展前端类型**

`RecognitionJob` 增加：

```ts
sourceFileIds?: string[];
```

- [ ] **步骤 3：新增创建模式状态**

在 `NewRecognitionPage.tsx`：

```ts
type CreateMode = 'merge' | 'separate';
const [createMode, setCreateMode] = useState<CreateMode>('merge');
```

- [ ] **步骤 4：新增合并任务提交函数**

```ts
const uploadAndCreateMergedJob = async (filesToUpload: File[]): Promise<boolean> => {
  const storedFiles = [];

  for (let i = 0; i < filesToUpload.length; i++) {
    setProgressText(`正在上传文件 (${i + 1}/${filesToUpload.length})...`);
    storedFiles.push(await filesApi.upload(filesToUpload[i]));
  }

  setProgressText('正在创建合并识别任务...');
  await createJob.mutateAsync({
    schemaKey,
    sourceFileIds: storedFiles.map((file) => file.id),
  });

  return true;
};
```

- [ ] **步骤 5：调整 handleSubmit**

在现有逐文件循环前加入：

```ts
if (createMode === 'merge') {
  await uploadAndCreateMergedJob(filesToUpload);
  setProgressText('✅ 合并任务创建成功，正在跳转...');
  toast.success(`成功创建 1 个合并识别任务（${filesToUpload.length} 个文件）`);
  setFiles([]);
  setUseExample(false);
  setTimeout(() => navigate('/jobs'), 2000);
  return;
}
```

- [ ] **步骤 6：增加 UI 控件**

```tsx
<Radio.Group
  type="button"
  value={createMode}
  onChange={(value) => setCreateMode(value as CreateMode)}
  style={{ marginBottom: 16 }}
>
  <Radio value="merge">合并为一个任务</Radio>
  <Radio value="separate">每个文件分别创建任务</Radio>
</Radio.Group>
<Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
  合并模式会按上传顺序 OCR 多张图片，并生成一个病例级识别结果。
</Typography.Text>
```

- [ ] **步骤 7：运行 UI 构建**

```bash
pnpm --filter medical-ui build
```

预期：PASS。

---

## 任务 6：任务详情显示多文件数量

**文件：**
- 修改：`medical-ui/src/pages/JobDetailPage.tsx`

- [ ] **步骤 1：计算文件数量**

```ts
const sourceFileIds = Array.isArray(job?.sourceFileIds)
  ? job.sourceFileIds
  : Array.isArray(job?.options?.sourceFileIds)
    ? job.options.sourceFileIds.filter((id): id is string => typeof id === 'string')
    : [];
const sourceFileCount = sourceFileIds.length || (job?.sourceFileId ? 1 : 0);
```

- [ ] **步骤 2：显示数量**

在任务信息卡片加入：

```tsx
<Descriptions.Item label="源文件数量">
  {sourceFileCount > 0 ? `${sourceFileCount} 个` : '-'}
</Descriptions.Item>
```

- [ ] **步骤 3：运行 UI 构建**

```bash
pnpm --filter medical-ui build
```

预期：PASS。

---

## 任务 7：固定测试集 Manifest 草案

**文件：**
- 创建：`docs/evaluation/fixed-medical-image-set-2026-06-15.manifest.json`

- [ ] **步骤 1：创建 manifest**

创建 JSON，至少包含单图、多图和带期望截图三类样本：

```json
{
  "id": "fixed-medical-image-set-2026-06-15",
  "label": "固定测试集共45个样本",
  "schemaKey": "comprehensive-tumor-evaluation",
  "sensitivity": "real_deidentified",
  "basePath": "C:/Users/24628/Desktop/固定测试集共45个样本",
  "samples": [
    {
      "id": "260518101",
      "group": "1测试不同癌种解读匹配10",
      "title": "膀胱癌",
      "inputFiles": ["1测试不同癌种解读匹配10/260518101膀胱癌.png"],
      "expectedFiles": [],
      "tags": ["癌种识别", "单图"]
    },
    {
      "id": "260518307",
      "group": "3测试上传的不同类型图片能否准确识别7",
      "title": "同时上传3张资料余明明",
      "inputFiles": [
        "3测试上传的不同类型图片能否准确识别7/260518307测同时上传3张资料余明明1.png",
        "3测试上传的不同类型图片能否准确识别7/260518307测同时上传3张资料余明明2.png",
        "3测试上传的不同类型图片能否准确识别7/260518307测同时上传3张资料余明明3.png"
      ],
      "expectedFiles": [],
      "tags": ["多图", "资料聚合"]
    }
  ],
  "notes": [
    "本文件是 manifest 草案，先定义多图样本结构。",
    "后续人工标注 groundTruth 后可转换为 evaluation dataset。",
    "评估时文件名应可选择脱敏，避免模型从文件名猜答案。"
  ]
}
```

- [ ] **步骤 2：验证 JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('docs/evaluation/fixed-medical-image-set-2026-06-15.manifest.json','utf8')); console.log('manifest ok')"
```

预期输出：`manifest ok`。

---

## 任务 8：全量验证

- [ ] **步骤 1：运行 core 测试**

```bash
pnpm --filter @medical-record-agent/core test
```

预期：PASS。

- [ ] **步骤 2：运行 API 相关测试**

```bash
pnpm --filter @medical-record-agent/api test -- jobs.routes api-services
```

预期：PASS。

- [ ] **步骤 3：运行 UI 构建**

```bash
pnpm --filter medical-ui build
```

预期：PASS。

- [ ] **步骤 4：运行仓库级构建**

```bash
pnpm build
```

预期：PASS。

- [ ] **步骤 5：手动验证多图创建任务**

1. 启动应用。
2. 进入新建识别任务页。
3. 上传两张 PNG。
4. 选择“合并为一个任务”。
5. 点击创建。
6. 任务列表确认只新增一个任务。
7. 任务详情确认“源文件数量”为 2。
8. 结果中确认 OCR 文本包含两张图片内容。

预期：创建一个 job，详情显示 2 个源文件，结果为一次病例级抽取。

---

## 自检结果

### 规格覆盖度

- 动态完整评估 schema：任务 1 覆盖。
- 多图合并任务：任务 2、3、5、6 覆盖。
- 多图重跑：任务 4 覆盖。
- 固定测试集 manifest：任务 7 覆盖。
- 验证：任务 8 覆盖。

### 占位符扫描

计划中没有要求新增 `comprehensiveTumorEvaluationSchema.ts`，也没有要求修改 `packages/core/src/index.ts`。schema 新增路径统一为 JSON/DB 动态配置。

### 类型一致性

- API 输入字段统一为 `sourceFileIds`。
- 核心输入字段统一为 `documents`。
- 单文件兼容字段保留为 `sourceFileId` 和 `document`。
- 多文件列表第一张文件继续写入 `sourceFileId`，完整列表存入 `options.sourceFileIds`。
