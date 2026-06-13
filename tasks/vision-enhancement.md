# 任务：LLM 视觉增强 — 让大模型看原图识别勾选框和手写体

## 背景
当前识别流程：OCR 提取文字 → LLM 只看文字抽取字段。
问题：OCR 无法识别勾选框（□ vs ☑）和手写体（如"肺腺cu"应为"肺腺癌"）。
方案：把原图（base64）传给 LLM，让 LLM 用视觉能力直接看图判断勾选和手写内容。

## 需要修改的文件（共 5 个）

### 1. `packages/core/src/providers/providerTypes.ts`
在 `ModelExtractionRequest` 接口中添加可选的 `imageBase64` 字段：

```typescript
export interface ModelExtractionRequest {
  schema: import("../schemas/schemaValidator").CoreSchemaDraft;
  prompt: string;
  ocrText: string;
  ragContext?: string[];
  imageBase64?: string;  // 新增：原图 base64，用于 LLM 视觉增强
}
```

### 2. `packages/core/src/engine/extractionEngine.ts`
在 `ExtractStructuredFieldsInput` 接口和 `extractStructuredFields` 函数中传递 `imageBase64`：

- `BuildExtractionPromptInput` 接口添加 `imageBase64?: string`
- `ExtractStructuredFieldsInput` 接口添加 `imageBase64?: string`
- `extractStructuredFields` 函数将 `imageBase64` 传入 `request` 对象
- `buildExtractionPrompt` 函数：如果提供了 `imageBase64`，在 prompt 末尾添加视觉增强指令

prompt 增强部分（当 imageBase64 存在时追加到 prompt 末尾）：
```
【视觉增强说明】
本次抽取同时提供了原始文档图片。请结合图片进行以下判断：
1. 勾选框识别：对于 list/enum 类型字段，仔细查看图片中对应的勾选框（□），判断哪些被勾选（☑ 或 ✓ 或手写标记）。被勾选的选项加入 list 值，未勾选的不要包含。
2. 手写体修正：OCR 对手写内容识别较差（如身份证号、日期、医生签名、诊断名称等），请对照图片中的手写内容修正 OCR 文本中的错误。
3. 冲突处理：如果图片与 OCR 文本不一致，以图片为准，在 rawValue 中注明 OCR 原文。
```

### 3. `packages/core/src/agents/extractionAgent.ts`
在 `ExtractionAgentInput` 接口和 `run` 方法中传递 `imageBase64`：

```typescript
export interface ExtractionAgentInput {
  schema: CoreSchemaDraft;
  ocrText: string;
  targetFieldKeys?: string[];
  imageBase64?: string;  // 新增
}
```

在 `run` 方法中将 `input.imageBase64` 传给 `extractStructuredFields`。

### 4. `packages/core/src/engine/langgraphRecognitionWorkflow.ts`
在 `extractionNode` 中，从 `state.document.content` 提取图片 base64 传给 extractionAgent：

```typescript
// 在 extractionNode 中
const imageBase64 = state.document.content
  ? Buffer.from(state.document.content).toString("base64")
  : undefined;

const extraction = await extractionAgent.run({
  schema: config.schema,
  ocrText: state.ocrText,
  targetFieldKeys: config.schema.fields.map((field) => field.key),
  imageBase64  // 新增
});
```

### 5. `packages/core/src/providers/httpLlmProvider.ts`
修改 `extractFields` 方法，支持 vision API（multimodal messages）：

当 `request.imageBase64` 存在时，将 user message 从纯文本改为 multimodal 格式：

```typescript
// 有图片时用 vision 格式
const userContent = request.imageBase64
  ? [
      { type: "text", text: request.prompt },
      {
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${request.imageBase64}`,
          detail: "high"
        }
      }
    ]
  : request.prompt;

body: JSON.stringify({
  model: config.model,
  messages: [
    {
      role: "system",
      content: "你是病历字段结构化抽取模型，只能返回 JSON 对象。你会仔细查看文档图片，准确识别勾选框状态和手写内容。"
    },
    {
      role: "user",
      content: userContent
    }
  ],
  response_format: { type: "json_object" }
})
```

## 验证步骤
1. `cd /tmp/Medical-Record-Agent && pnpm build` 编译通过
2. 重启 API 服务：`cd /tmp/Medical-Record-Agent/apps/api && pnpm dev`
3. 用已有任务 `cmqaqlblw0005wmdsru31zghi` 重新提交识别，检查 LLM 是否收到图片

## 注意事项
- `imageBase64` 全链路都是可选字段，不破坏现有流程
- 不修改 OCR provider，OCR 只负责文字提取
- system message 要强调"仔细查看文档图片"
- 图片 detail 设为 "high" 以获得更好的识别效果
- 完成后输出审计报告：修改了哪些文件、每项改动内容、编译结果
