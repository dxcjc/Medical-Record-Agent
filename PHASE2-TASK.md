# Phase 2 任务：视觉评审 Agent

## 目标
新增视觉评审Agent，利用视觉模型直接看图片获取OCR无法获取的信息（勾选框、页眉、手写体），注入到抽取Agent的prompt中提升准确率。

## 项目路径
/tmp/Medical-Record-Agent

## 当前架构理解

### 工作流节点
preprocess → ocr → rag → extraction → validation → autoDecision → writeback → evaluation → finalize

### 关键接口
- `OcrProvider` — OCR识别，返回 `OcrResult`
- `ModelProvider` — LLM抽取，返回 `ModelExtractionResult`
- `KnowledgeRetriever` — 知识检索
- `JobOrchestratorConfig` — 包含 `ocrProvider`, `modelProvider`, `knowledgeRetriever`, `schema` 等
- `RecognitionWorkflowAnnotation` — LangGraph状态定义
- `ExtractionAgentInput` — 抽取Agent输入，已有 `imageBase64` 字段

### 文件位置
- 接口定义: `packages/core/src/providers/providerTypes.ts` (239行)
- 工作流: `packages/core/src/engine/langgraphRecognitionWorkflow.ts` (421行)
- 任务编排器: `packages/core/src/engine/jobOrchestrator.ts` (163行)
- 抽取Agent: `packages/core/src/agents/extractionAgent.ts` (75行)
- 抽取引擎: `packages/core/src/engine/extractionEngine.ts` (364行)
- 服务组装: `apps/api/src/bootstrap/production-services.ts` (2875行)

## 任务清单

### T1: 新增视觉评审接口定义

**文件**: `packages/core/src/providers/providerTypes.ts`

在文件末尾（`ModelProviderFactoryConfig` 类型之后）新增：

```typescript
// ── 视觉评审 Provider ──

export interface VisualFieldAssessment {
  fieldKey: string;
  existsInImage: boolean;      // 图片上是否有该信息
  visualValue: string | null;  // 视觉模型看到的值
  confidence: number;          // 视觉确认置信度 0-1
  location: string;            // 信息在图片中的位置描述
}

export interface VisualReviewInput {
  imageBase64: string;
  schema: import("../schemas/schemaValidator").CoreSchemaDraft;
  ocrText: string;  // 供参考
}

export interface VisualReviewResult {
  providerName: string;
  fieldAssessments: VisualFieldAssessment[];
  overallQuality: "high" | "medium" | "low";
  imageDescription: string;
}
```

### T2: 新增视觉评审 Agent

**新建文件**: `packages/core/src/agents/visualReviewAgent.ts`

```typescript
import type { ModelProvider, VisualFieldAssessment, VisualReviewResult } from "../providers/providerTypes";
import type { CoreSchemaDraft } from "../schemas/schemaValidator";

export interface VisualReviewAgentInput {
  imageBase64: string;
  schema: CoreSchemaDraft;
  ocrText: string;
}

export interface VisualReviewAgentResult extends VisualReviewResult {}

export interface VisualReviewAgent {
  allowedTools: readonly ["model.extractFields"];
  run(input: VisualReviewAgentInput): Promise<VisualReviewAgentResult>;
}

export interface CreateVisualReviewAgentInput {
  provider: ModelProvider;  // 复用 ModelProvider（httpLlmProvider 已支持 vision）
}

function buildVisualReviewPrompt(schema: CoreSchemaDraft, ocrText: string): string {
  const fieldList = schema.fields
    .map((f) => `- ${f.key}（${f.label}）：${f.comments?.join(" ") || "无额外说明"}`)
    .join("\n");

  return [
    "你是一名医学文档视觉分析专家。请仔细查看这张病历图片，对以下每个字段判断：",
    "1. 该信息是否在图片中存在",
    "2. 如果存在，图片上显示的具体值是什么",
    "3. 你的置信度（0-1）",
    "",
    "特别注意：",
    "- 仔细查看页眉、页脚、抬头区域，这些常包含患者姓名和医院名称",
    "- 对于勾选框（□），判断哪些被勾选（☑或✓或手写标记）",
    "- 对于手写内容，尽量识别但注明不确定",
    "- 如果OCR文本中已有该信息且与图片一致，直接采用",
    "- 如果OCR文本中没有但图片上有，以图片为准",
    "",
    "字段列表：",
    fieldList,
    "",
    "以下是从OCR文本供参考（可能不完整）：",
    ocrText.slice(0, 2000),
    "",
    "输出JSON格式：",
    "{",
    '  "fieldAssessments": [',
    "    {",
    '      "fieldKey": "xxx",',
    '      "existsInImage": true或false,',
    '      "visualValue": "值或null",',
    '      "confidence": 0.9,',
    '      "location": "图片位置描述"',
    "    }",
    "  ],",
    '  "overallQuality": "high/medium/low",',
    '  "imageDescription": "图片整体描述"',
    "}"
  ].join("\n");
}

export function createVisualReviewAgent(config: CreateVisualReviewAgentInput): VisualReviewAgent {
  return {
    allowedTools: ["model.extractFields"],
    async run(input) {
      const prompt = buildVisualReviewPrompt(input.schema, input.ocrText);

      const result = await config.provider.extractFields({
        schema: input.schema,
        prompt,
        ocrText: input.ocrText,
        imageBase64: input.imageBase64
      });

      // 解析视觉模型的输出
      const raw = result.raw as Record<string, unknown> | undefined;
      const parsed = parseVisualReviewOutput(raw, result, input.schema);

      return {
        providerName: result.providerName,
        ...parsed
      };
    }
  };
}

function parseVisualReviewOutput(
  raw: Record<string, unknown> | undefined,
  result: { candidates: { fieldKey: string; value: string | number | boolean | string[] | null; confidence: number }[] },
  schema: CoreSchemaDraft
): { fieldAssessments: VisualFieldAssessment[]; overallQuality: "high" | "medium" | "low"; imageDescription: string } {
  // 尝试从 raw 中解析结构化输出
  if (raw && typeof raw === "object") {
    const assessments = raw.fieldAssessments;
    const quality = raw.overallQuality;
    const desc = raw.imageDescription;

    if (Array.isArray(assessments)) {
      return {
        fieldAssessments: assessments.map((a: Record<string, unknown>) => ({
          fieldKey: String(a.fieldKey ?? ""),
          existsInImage: Boolean(a.existsInImage),
          visualValue: a.visualValue != null ? String(a.visualValue) : null,
          confidence: typeof a.confidence === "number" ? a.confidence : 0.5,
          location: String(a.location ?? "未知")
        })),
        overallQuality: quality === "high" || quality === "low" ? quality : "medium",
        imageDescription: typeof desc === "string" ? desc : ""
      };
    }
  }

  // Fallback: 从 candidates 构建
  return {
    fieldAssessments: result.candidates.map((c) => ({
      fieldKey: c.fieldKey,
      existsInImage: c.value !== null,
      visualValue: c.value != null ? String(c.value) : null,
      confidence: c.confidence,
      location: "视觉模型推断"
    })),
    overallQuality: "medium",
    imageDescription: "视觉模型输出格式异常，已回退到候选字段推断"
  };
}
```

### T3: 新增视觉评审节点到 LangGraph 工作流

**文件**: `packages/core/src/engine/langgraphRecognitionWorkflow.ts`

#### 3a. 新增 import

在文件顶部新增：
```typescript
import { createVisualReviewAgent, type VisualReviewAgentResult } from "../agents/visualReviewAgent";
```

#### 3b. 扩展 RecognitionWorkflowState

在 `RecognitionWorkflowState` 接口中新增：
```typescript
visualReview?: VisualReviewAgentResult;
```

#### 3c. 扩展 RecognitionWorkflowAnnotation

在 Annotation.Root 中新增：
```typescript
visualReview: Annotation<VisualReviewAgentResult | undefined>,
```

#### 3d. 新增 visualReviewNode

在 `ocrNode` 之后新增节点：

```typescript
const visualReviewNode = async (state: RecognitionWorkflowState) => {
  if (state.error) {
    return trace("visualReview", "skipped", "前序节点失败，跳过视觉评审。");
  }

  // 多文档模式不传图片
  const hasMultipleDocuments = state.documents !== undefined && state.documents.length > 0;
  const imageBase64 = !hasMultipleDocuments && state.document.content
    ? Buffer.from(state.document.content).toString("base64")
    : undefined;

  if (!imageBase64) {
    return trace("visualReview", "skipped", "无图片内容，跳过视觉评审。");
  }

  try {
    const visualAgent = createVisualReviewAgent({
      provider: config.modelProvider
    });

    const visualReview = await visualAgent.run({
      imageBase64,
      schema: config.schema,
      ocrText: state.ocrText ?? ""
    });

    return {
      ...trace("visualReview", "completed", `视觉评审已完成，识别 ${visualReview.fieldAssessments.length} 个字段。`),
      visualReview
    };
  } catch (error) {
    // 视觉评审失败不阻塞主流程
    return {
      ...trace("visualReview", "failed", "视觉评审失败，将仅依赖OCR文本。"),
      visualReview: undefined
    };
  }
};
```

#### 3e. 修改图连接

将当前线性连接：
```
preprocess → ocr → rag → extraction → ...
```

改为并行扇出：
```
preprocess → ocr → rag ─────────────────┐
         └→ visualReview ──────────────┤→ extraction → ...
```

具体修改：
```typescript
// 删除：
.addEdge("ocrNode", "ragNode")
.addEdge("ragNode", "extractionNode")

// 替换为：
.addEdge("ocrNode", "ragNode")
.addEdge("ocrNode", "visualReviewNode")
.addEdge("ragNode", "extractionNode")
.addEdge("visualReviewNode", "extractionNode")
```

**注意**：LangGraph 中多个边指向同一个节点时，会等待所有前置节点完成才执行。所以 `extractionNode` 会等 `ragNode` 和 `visualReviewNode` 都完成。

#### 3f. 注册节点

在 `new StateGraph(RecognitionWorkflowAnnotation)` 的节点注册中新增：
```typescript
.addNode("visualReviewNode", visualReviewNode)
```

#### 3g. 修改 extractionNode

在 `extractionNode` 中注入视觉特征到 prompt：

```typescript
const extractionNode = async (state: RecognitionWorkflowState) => {
  if (state.error || !state.ocrText) {
    return trace("extraction", "skipped", "缺少 OCR 文本，跳过抽取。");
  }

  try {
    const hasMultipleDocuments = state.documents !== undefined && state.documents.length > 0;
    const imageBase64 = !hasMultipleDocuments && state.document.content
      ? Buffer.from(state.document.content).toString("base64")
      : undefined;

    // 构建视觉上下文
    let visualContext: string | undefined;
    if (state.visualReview) {
      const vr = state.visualReview;
      const visualLines = vr.fieldAssessments
        .filter((a) => a.existsInImage)
        .map((a) => {
          const val = a.visualValue ?? "存在但值不确定";
          return `- ${a.fieldKey}：图片显示"${val}"（置信度${a.confidence.toFixed(2)}，位置：${a.location}）`;
        });
      if (visualLines.length > 0) {
        visualContext = [
          "【视觉评审结果】",
          "以下信息由视觉模型从图片中直接获取，请作为重要参考：",
          ...visualLines,
          "",
          "如果视觉结果与OCR文本冲突，以视觉为准。"
        ].join("\n");
      }
    }

    const extraction = await extractionAgent.run({
      schema: config.schema,
      ocrText: state.ocrText,
      targetFieldKeys: config.schema.fields.map((field) => field.key),
      ...(imageBase64 !== undefined ? { imageBase64 } : {}),
      ...(visualContext !== undefined ? { visualContext } : {})
    });

    return {
      ...trace("extraction", "completed", "字段抽取已完成。"),
      extraction
    };
  } catch (error) {
    return {
      ...trace("extraction", "failed", "模型 provider 调用失败。"),
      status: "failed" as const,
      error: mapUnknownError(error)
    };
  }
};
```

### T4: 扩展 ExtractionAgentInput 支持视觉上下文

**文件**: `packages/core/src/agents/extractionAgent.ts`

在 `ExtractionAgentInput` 接口中新增：
```typescript
visualContext?: string;  // 视觉评审结果注入
```

在 `run` 方法中，将视觉上下文注入到 `extractStructuredFields` 调用：
```typescript
// 在 ocrText 后追加视觉上下文
const fullOcrText = input.visualContext
  ? `${input.ocrText}\n\n${input.visualContext}`
  : input.ocrText;

const extraction = await extractStructuredFields({
  provider: config.provider,
  schema: input.schema,
  ocrText: fullOcrText,
  ragContext: retrieval.context,
  ...(input.imageBase64 !== undefined ? { imageBase64: input.imageBase64 } : {})
});
```

### T5: 扩展 RecognitionTraceEvent 支持 visualReview 节点

**文件**: `packages/core/src/engine/jobOrchestrator.ts`

在 `RecognitionTraceEvent` 的 `node` 联合类型中新增：
```typescript
| "visualReview"
```

在 `JobOrchestratorResult` 接口中新增：
```typescript
import type { VisualReviewAgentResult } from "../agents/visualReviewAgent";
// ...
visualReview?: VisualReviewAgentResult;
```

### T6: 扩展状态归一化

**文件**: `packages/core/src/engine/langgraphRecognitionWorkflow.ts`

在 `normalizeLangGraphState` 函数中新增：
```typescript
if (state.visualReview !== undefined) {
  normalized.visualReview = state.visualReview;
}
```

在 `toJobOrchestratorResult` 函数中新增：
```typescript
if (state.visualReview !== undefined) {
  result.visualReview = state.visualReview;
}
```

### T7: 重建 API + 重启服务

```bash
cd /tmp/Medical-Record-Agent
pnpm --filter @medical-record-agent/api build
cd /tmp/Medical-Record-Agent/apps/api
kill $(lsof -t -i:3000) 2>/dev/null || true
sleep 2
nohup node dist/index.js > /tmp/mra-api.log 2>&1 &
sleep 3
curl -s http://127.0.0.1:3000/health || echo "API启动失败"
```

### T8: 癌种定向测试验证

```bash
cd /tmp/Medical-Record-Agent
python3 scripts/evaluate.py --filter-category "癌种识别" --concurrency 2
```

验收标准：
- 字段召回率 ≥ 81.6%（Phase 1水平）
- 字段精确率 ≥ 95%
- 字段F1 ≥ 88.9%

## 重要约束

1. **视觉评审失败不阻塞主流程** — 视觉评审是增强功能，失败时回退到仅OCR模式
2. **复用现有 ModelProvider** — 视觉评审使用同一个 httpLlmProvider（doubao已支持vision），不新建Provider
3. **保持向后兼容** — API接口不变，前端无感知
4. **OCR和视觉并行** — 两者都从preprocess分支，并行执行，在extraction前合并

## 完成后

生成审计报告（AUDIT-PHASE2.md），包含：
1. 新增/修改的文件列表
2. 新增的接口和类型
3. 工作流变更（节点+边）
4. 测试结果（指标对比Phase 1）
5. 是否有遗漏
