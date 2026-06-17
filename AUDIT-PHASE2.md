# Phase 2 审计报告：视觉评审 Agent

## 1. 新增/修改的文件列表

### 新增文件
| 文件 | 说明 |
|------|------|
| `packages/core/src/agents/visualReviewAgent.ts` | 视觉评审 Agent，利用视觉模型从图片中提取信息 |

### 修改文件
| 文件 | 修改内容 |
|------|----------|
| `packages/core/src/providers/providerTypes.ts` | 新增 `VisualFieldAssessment`、`VisualReviewInput`、`VisualReviewResult` 接口 |
| `packages/core/src/agents/extractionAgent.ts` | 新增 `visualContext` 字段，将视觉评审结果注入抽取 prompt |
| `packages/core/src/engine/langgraphRecognitionWorkflow.ts` | 新增 `visualReviewNode`，修改图结构实现并行扇出 |
| `packages/core/src/engine/jobOrchestrator.ts` | 扩展 `RecognitionTraceEvent` 和 `JobOrchestratorResult` 支持 `visualReview` |

## 2. 新增的接口和类型

### `VisualFieldAssessment`
```typescript
interface VisualFieldAssessment {
  fieldKey: string;
  existsInImage: boolean;      // 图片上是否有该信息
  visualValue: string | null;  // 视觉模型看到的值
  confidence: number;          // 视觉确认置信度 0-1
  location: string;            // 信息在图片中的位置描述
}
```

### `VisualReviewResult`
```typescript
interface VisualReviewResult {
  providerName: string;
  fieldAssessments: VisualFieldAssessment[];
  overallQuality: "high" | "medium" | "low";
  imageDescription: string;
}
```

### `VisualReviewAgentInput` / `VisualReviewAgentResult`
```typescript
interface VisualReviewAgentInput {
  imageBase64: string;
  schema: CoreSchemaDraft;
  ocrText: string;
}

interface VisualReviewAgentResult extends VisualReviewResult {}
```

### `ExtractionAgentInput` 扩展
```typescript
interface ExtractionAgentInput {
  // ... 已有字段
  visualContext?: string;  // 视觉评审结果注入（新增）
}
```

## 3. 工作流变更

### 节点变更
- **新增节点**: `visualReviewNode` — 视觉评审，从图片中直接提取字段信息
- **修改节点**: `extractionNode` — 注入视觉上下文到抽取 prompt

### 图结构变更

**变更前（线性）**:
```
preprocess → ocr → rag → extraction → validation → ...
```

**变更后（并行扇出）**:
```
preprocess → ocr → rag ─────────────────┐
         └→ visualReview ──────────────┤→ extraction → validation → ...
```

LangGraph 中多个边指向同一节点时，会等待所有前置节点完成才执行。`extractionNode` 等待 `ragNode` 和 `visualReviewNode` 都完成。

### 视觉评审工作原理

1. `visualReviewNode` 使用 `ModelProvider.extractFields()` 调用视觉模型
2. 视觉模型查看图片，对每个 schema 字段判断是否存在、具体值、置信度
3. 输出标准 `{ fields: [...] }` 格式（兼容 `parseModelExtractionOutput`）
4. 结果转换为 `VisualFieldAssessment[]` 格式
5. `extractionNode` 将视觉上下文注入到抽取 prompt 中：
   - 过滤出 `existsInImage: true` 的字段
   - 格式化为 `【视觉评审结果】` 文本块
   - 追加到 ocrText 后传给抽取模型

### 容错设计
- 视觉评审失败不阻塞主流程（catch 后返回 `visualReview: undefined`）
- 多文档模式跳过视觉评审（无单张图片可分析）
- 无图片内容时跳过视觉评审

## 4. 测试结果

### 癌种识别评估（10 个样本）

| 指标 | Phase 1 基线 | Phase 2 结果 | 达标 |
|------|-------------|-------------|------|
| 字段召回率 | ≥ 81.6% | 81.6% | ✅ |
| 字段精确率 | ≥ 95% | 97.6% | ✅ |
| 字段 F1 | ≥ 88.9% | 88.9% | ✅ |
| 完全正确样本 | - | 4/10 (40%) | - |

### 字段级分析
| 字段 | 匹配率 | 准确率 |
|------|--------|--------|
| patientName | 6/10 | 60.0% |
| tumorType | 8/10 | 80.0% |
| hospitalName | 5/10 | 50.0% |
| patientGender | 10/10 | 100.0% |
| pathologicalDiagnosis | 10/10 | 100.0% |

### 视觉评审执行情况
- 所有 10 个样本的 `visualReviewNode` 均执行成功（trace 显示 `completed`）
- 视觉评审结果正确注入到抽取 prompt 中

## 5. 是否有遗漏

### 已完成
- ✅ 视觉评审接口定义（`providerTypes.ts`）
- ✅ 视觉评审 Agent（`visualReviewAgent.ts`）
- ✅ 工作流并行扇出（`visualReviewNode` 和 `extractionNode` 并行）
- ✅ 视觉上下文注入到抽取 prompt
- ✅ 状态归一化和 trace 事件支持
- ✅ 错误处理（视觉评审失败不阻塞主流程）
- ✅ 评估测试通过

### 已知限制
1. **hospitalName 准确率低（50%）**: 部分病历图片中没有医院名称，视觉模型也无法提取
2. **patientName 准确率中等（60%）**: 部分病历的患者姓名在页眉/页脚，OCR 和视觉模型都可能遗漏
3. **API 响应不直接返回 visualReview 数据**: 数据存储在 payload 中，但 GET /jobs/:id 响应不包含此字段（需从 resultUrl 获取）

### 后续优化建议
1. 优化视觉评审 prompt，针对页眉/页脚区域做更细致的扫描
2. 考虑在 API 响应中直接返回 visualReview 摘要
3. 添加视觉评审置信度阈值，低置信度结果不注入抽取 prompt

## 6. 实现过程中的关键修复

### 问题 1: `parseModelExtractionOutput` 格式不兼容
- **现象**: 视觉评审节点始终返回 "failed"
- **原因**: 视觉评审 prompt 输出 `{ fieldAssessments: [...] }` 格式，但 `httpLlmProvider.extractFields()` 内部调用 `parseModelExtractionOutput` 要求 `{ fields: [...] }` 格式
- **修复**: 修改视觉评审 prompt 为标准 `{ fields: [...] }` 格式，从 candidates 重建 `VisualFieldAssessment`

### 问题 2: 根节点包含非法键
- **现象**: `parseModelExtractionOutput` 拒绝 `{ fields: [...], imageQuality: "...", imageDesc: "..." }`
- **原因**: `hasOnlyKeys(root, ["fields"])` 严格校验只有 `"fields"` 键
- **修复**: 修改 prompt 只输出 `{ "fields": [...] }`，不添加额外顶级字段
