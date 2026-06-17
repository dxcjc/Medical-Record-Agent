# 医疗病历识别系统 — 多智能体架构重构方案

> 版本：v1.0 | 日期：2026-06-16
> 设计目标：知识驱动 + 多智能体协作 + 视觉增强 + 通用评估

---

## 一、设计原则

| 原则 | 说明 |
|------|------|
| **知识驱动** | 所有领域知识放在知识库，代码层零特异性逻辑 |
| **多信息源** | OCR + 视觉模型双通道，不依赖单一信息源 |
| **Schema即配置** | 新增字段/癌种只需改Schema+知识库，不改代码 |
| **通用评估** | 评估脚本不做领域匹配，只做通用比较 |
| **置信度分层** | 多维度置信度，视觉确认度独立于抽取确信度 |

---

## 二、当前架构 vs 新架构

### 2.1 当前架构（单管线）

```
图片 → OCR → RAG(关键词) → LLM抽取(单次) → 验证 → 决策 → 回写
```

**问题：**
1. OCR漏掉的信息永远丢失
2. 所有字段在一次prompt中抽取，字段多时质量下降
3. 领域知识硬编码在extractionCore.ts
4. 评估脚本需要写特异性匹配逻辑

### 2.2 新架构（多智能体协作）

```
                    ┌─────────────────┐
                    │    图片输入      │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
          ┌─────────────┐   ┌─────────────┐
          │  OCR Agent  │   │ 视觉评审Agent │
          │  (文本提取)  │   │ (图像理解)    │
          └──────┬──────┘   └──────┬──────┘
                 │                 │
                 │    ┌────────────┤
                 │    │            │
                 ▼    ▼            │
          ┌─────────────┐         │
          │  RAG Agent  │         │
          │ (知识检索)   │         │
          └──────┬──────┘         │
                 │                │
                 ▼                ▼
          ┌──────────────────────────┐
          │      抽取 Agent          │
          │  (多轮次、按字段组抽取)    │
          │  输入: OCR文本 + 视觉特征 │
          │  + RAG上下文              │
          └──────────┬───────────────┘
                     │
                     ▼
          ┌──────────────────────────┐
          │      校验 Agent          │
          │  (格式/类型/冲突检查)     │
          │  + 视觉置信度合并         │
          └──────────┬───────────────┘
                     │
                     ▼
          ┌──────────────────────────┐
          │    自动决策 + 回写        │
          └──────────────────────────┘
```

---

## 三、各Agent详细设计

### 3.1 OCR Agent（增强现有）

**职责**：图片 → 结构化文本

**改造点**：
- 保持现有 `OcrProvider` 接口不变
- 新增：OCR质量评估（返回 `qualityScore`）
- 新增：多文档并发OCR（`Promise.all`）
- 输出：`OcrResult` + `qualityScore`

**接口变更**：
```typescript
interface OcrResult {
  pages: OcrPage[];
  qualityScore: number;  // 新增：0-1，OCR识别质量
  qualityWarnings: string[];
}
```

### 3.2 视觉评审 Agent（新增）

**职责**：直接看图片，提取OCR无法获取的视觉信息

**核心能力**：
1. **勾选框识别**：判断□/☑状态
2. **手写体识别**：OCR对手写体质量差，视觉模型直接读
3. **页眉页脚信息**：患者姓名、医院名常在页眉，OCR可能漏掉
4. **信息存在性确认**：判断某个字段在图片上是否存在

**接口定义**：
```typescript
interface VisualReviewAgentInput {
  imageBase64: string;
  schema: CoreSchemaDraft;
  ocrText: string;  // 供参考
}

interface VisualFieldAssessment {
  fieldKey: string;
  existsInImage: boolean;     // 图片上是否有该信息
  visualValue: string | null; // 视觉模型看到的值
  confidence: number;         // 视觉确认置信度 0-1
  location: string;           // 信息在图片中的位置描述
}

interface VisualReviewAgentOutput {
  fieldAssessments: VisualFieldAssessment[];
  overallQuality: "high" | "medium" | "low";
  imageDescription: string;  // 图片整体描述
}
```

**Prompt设计**：
```
你是一名医学文档视觉分析专家。请仔细查看这张病历图片，对以下每个字段判断：
1. 该信息是否在图片中存在
2. 如果存在，图片上显示的具体值是什么
3. 你的置信度（0-1）

特别注意：
- 仔细查看页眉、页脚、抬头区域，这些常包含患者姓名和医院名称
- 对于勾选框（□），判断哪些被勾选（☑或✓或手写标记）
- 对于手写内容，尽量识别但注明不确定

字段列表：
{schema.fields.map(f => `- ${f.key}（${f.label}）：${f.comments}`).join('\n')}

输出JSON格式：
{
  "fieldAssessments": [
    {
      "fieldKey": "xxx",
      "existsInImage": true/false,
      "visualValue": "值或null",
      "confidence": 0.9,
      "location": "图片顶部/中部表格/底部签名栏"
    }
  ],
  "overallQuality": "high/medium/low",
  "imageDescription": "图片整体描述"
}
```

### 3.3 RAG Agent（增强现有）

**职责**：根据OCR文本和Schema，检索相关知识库条目

**改造点**：
- 保持现有 `KnowledgeRetriever` 接口
- 新增：根据视觉特征检索（如视觉发现"勾选框"，检索勾选框相关知识）
- 知识库条目新增类型：`field-visual-rule`（视觉识别规则）

**新增知识库条目类型**：
```typescript
type KnowledgeEntryKind = 
  | "medical-term" 
  | "cancer-alias" 
  | "lims-dictionary" 
  | "field-description"
  | "field-visual-rule"    // 新增：视觉识别规则
  | "tumor-normalization"; // 新增：癌种标准化规则
```

### 3.4 抽取 Agent（重构核心）

**职责**：综合OCR文本 + 视觉特征 + RAG上下文，抽取结构化字段

**关键改造**：

#### 3.4.1 移除硬编码规则

从 `extractionCore.ts` 删除：
- `FIELD_EXTRACTION_RULES` 中的癌种标准化规则（C部分）
- 这些规则迁移到知识库

保留：
- 系统角色定义（`SYSTEM_ROLE_V2`）
- 通用提取规则（patientName、hospitalName的提取优先级）
- 不臆造规则（`ANTI_FABRICATION_RULES`）
- OCR纠错提示（`OCR_CORRECTION_HINTS`）

#### 3.4.2 Prompt中注入视觉特征

```
【视觉评审结果】
以下信息由视觉模型从图片中直接获取：

- patientName（患者姓名）：视觉确认存在，图片显示"钟新初"，置信度0.95
- hospitalName（医院名称）：视觉未发现该信息，置信度0.90
- patientGender（性别）：视觉确认勾选框"☑女"，置信度0.92

请将视觉结果作为重要参考，与OCR文本互相验证。如果视觉和OCR冲突，以视觉为准。
```

#### 3.4.3 按字段组分轮次抽取（可选优化）

当前：所有字段在一次prompt中抽取
优化：按字段组分多次抽取，每次聚焦相关字段

```
第1轮：基础信息（patientName, patientGender, age, hospitalName）
第2轮：肿瘤信息（tumorType, pathologicalDiagnosis, clinicalStage）
第3轮：检测信息（sampleType, detectionItems, geneMutations）
第4轮：其他（treatmentHistory, notes）
```

好处：每轮prompt更聚焦，准确率更高
代价：4次LLM调用，成本增加

### 3.5 校验 Agent（增强现有）

**职责**：格式校验 + 类型检查 + 视觉置信度合并

**改造点**：
- 现有 `validationEngine.ts` 逻辑保持
- 新增：合并视觉置信度

**置信度合并公式**：
```
finalConfidence = weightedAverage(
  llmConfidence * 0.6,      // LLM抽取置信度
  visualConfidence * 0.3,    // 视觉确认置信度
  ocrQuality * 0.1          // OCR质量
)
```

**视觉存在性检查**：
```
如果 visualField.existsInImage == false 且 finalConfidence > 0.5：
  → 降级为 needs_review（视觉说没有，但LLM说有，需要人工确认）
```

---

## 四、知识库重构

### 4.1 从代码迁移的知识

| 当前位置 | 迁移到知识库 | 条目类型 |
|---------|-------------|---------|
| extractionCore.ts L120-130 癌种标准化 | tumor-normalization 条目 | `tumor-normalization` |
| extractionCore.ts L105-118 患者姓名规则 | field-description 条目 | `field-description` |
| extractionCore.ts L112-118 医院名称规则 | field-description 条目 | `field-description` |
| evaluate.py fuzzy_match 术语映射 | 不迁移（删除，通用匹配） | - |

### 4.2 新增知识库条目

```typescript
// 癌种标准化规则（从extractionCore.ts迁移）
{
  id: "tumor-normalization-rules",
  kind: "tumor-normalization",
  title: "肿瘤类型标准化映射规则",
  content: `肿瘤类型(tumorType)标准化规则：
    - 尿路上皮癌（膀胱部位）→ 膀胱癌
    - 肾细胞癌 → 肾癌
    - 食管鳞状细胞癌 → 食管癌（不细化亚型）
    - 胃肠道间质瘤 → 胃肠道间质瘤（4字"胃肠道"，不简写）
    - 非霍奇金淋巴瘤/DLBCL → 非霍奇金淋巴瘤
    - 弥漫性胶质瘤 → 胶质瘤
    - （距肛缘XXcm处）腺癌 → 肛缘肠癌
    - （胰体尾）腺癌 → 胰腺癌
    - （胃小弯）腺癌 → 胃腺癌
    规则：器官部位 + 癌/瘤后缀 = 标准名称`,
  keywords: ["肿瘤类型", "标准化", "癌种", "tumorType", "映射"],
  fieldKeys: ["tumorType"]
}

// 视觉识别规则（新增）
{
  id: "visual-rule-checkbox",
  kind: "field-visual-rule",
  title: "勾选框视觉识别规则",
  content: `医学文档中的勾选框识别规则：
    - □ = 未勾选，☑/✓/手写√ = 已勾选
    - 勾选框通常出现在：性别、样本类型、检测项目、肿瘤分类、输血史等字段
    - 如果OCR无法区分勾选状态，依赖视觉模型判断`,
  keywords: ["勾选框", "□", "☑", "✓", "视觉", "checkbox"],
  fieldKeys: ["patientGender", "sampleType", "detectionItems", "tumorCategory", "transfusionHistory"]
}
```

### 4.3 知识库条目结构增强

```typescript
interface KnowledgeEntry {
  id: string;
  kind: KnowledgeEntryKind;
  title: string;
  content: string;
  keywords: string[];
  fieldKeys: string[];
  priority?: number;     // 新增：检索优先级（1-10）
  source?: string;       // 新增：来源标注（"code-migration" | "manual" | "auto"）
}
```

---

## 五、评估机制重构

### 5.1 当前评估的问题

| 问题 | 说明 |
|------|------|
| fuzzy_match做术语映射 | 评估脚本变成了"第二个模型" |
| baseline手动维护 | 每个样本的期望值需要人工设置 |
| 无视觉ground truth | 只比较文本，不知道图片上是否有该信息 |

### 5.2 新评估机制

#### 5.2.1 评估流程

```
图片 → 视觉评审Agent → 视觉ground truth（哪些字段在图片上存在）
                              ↓
系统识别结果 → 通用比较 → 评估报告
                              ↑
                         baseline期望值
```

#### 5.2.2 通用匹配规则（删除所有特异性逻辑）

```python
def match(expected, actual) -> bool:
    """通用匹配：不做任何领域特异性处理"""
    # null检查
    if expected is None:
        return actual is None
    if actual is None:
        return False
    # __ANY__检查
    if expected == "__ANY__":
        return actual is not None and actual != ""
    # 精确匹配
    if expected == actual:
        return True
    # 子串匹配（通用逻辑，不是特异性）
    if isinstance(expected, str) and isinstance(actual, str):
        return expected in actual or actual in expected
    return False
```

#### 5.2.3 视觉ground truth

新增评估步骤：对每个测试样本，先用视觉评审Agent生成ground truth

```python
def generate_visual_ground_truth(image_path, schema):
    """用视觉模型确认图片上有哪些字段"""
    visual_result = call_visual_agent(image_path, schema)
    ground_truth = {}
    for assessment in visual_result['fieldAssessments']:
        if assessment['existsInImage']:
            ground_truth[assessment['fieldKey']] = assessment['visualValue']
        else:
            ground_truth[assessment['fieldKey']] = None  # 图片上没有
    return ground_truth
```

#### 5.2.4 评估指标增强

| 指标 | 计算方式 |
|------|---------|
| 字段召回率 | 识别到的字段数 / 视觉确认存在的字段数 |
| 字段精确率 | 正确识别的字段数 / 识别到的字段数 |
| 幻觉率 | 图片上没有但系统输出了的字段数 / 总输出字段数 |
| 漏识别率 | 图片上有但系统没识别到的字段数 / 视觉确认存在的字段数 |

---

## 六、LangGraph工作流重构

### 6.1 新工作流定义

```typescript
// 新增节点
const nodes = {
  preprocess: "preprocess",
  ocr: "ocr",
  visualReview: "visualReview",    // 新增
  rag: "rag",
  extraction: "extraction",
  validation: "validation",
  autoDecision: "autoDecision",
  writeback: "writeback",
  evaluation: "evaluation",
  finalize: "finalize"
};

// 新增边（并行执行OCR和视觉评审）
addEdge(START, "preprocess");
addEdge("preprocess", "ocr");
addEdge("preprocess", "visualReview");  // OCR和视觉并行
addConditionalEdge("ocr", afterOcrAndVisual);  // 等待两者完成
addConditionalEdge("visualReview", afterOcrAndVisual);
addEdge("merged", "rag");
addEdge("rag", "extraction");
addEdge("extraction", "validation");
addEdge("validation", "autoDecision");
addEdge("autoDecision", "writeback");
addEdge("writeback", "evaluation");
addEdge("evaluation", "finalize");
addEdge("finalize", END);
```

### 6.2 状态扩展

```typescript
const RecognitionWorkflowAnnotation = Annotation.Root({
  // ... 现有字段 ...
  visualReview: Annotation<VisualReviewAgentOutput | undefined>,  // 新增
  mergedContext: Annotation<MergedContext | undefined>,            // 新增
});
```

---

## 七、实施计划

### Phase 1：知识库驱动改造（1-2天）
1. 从extractionCore.ts迁移癌种规则到知识库
2. 删除evaluate.py的fuzzy_match特异性逻辑
3. 测试验证知识库驱动效果

### Phase 2：视觉评审Agent（2-3天）
1. 实现VisualReviewAgent接口
2. 设计视觉评审Prompt
3. 集成到LangGraph工作流（并行执行）
4. 抽取Agent接收视觉特征

### Phase 3：置信度合并 + 评估重构（1-2天）
1. 实现多维度置信度合并
2. 重构评估脚本（通用匹配 + 视觉ground truth）
3. 全量回归测试

### Phase 4：优化 + 扩展（持续）
1. 按字段组分轮次抽取
2. 多文档并发OCR
3. 向量RAG升级

---

## 八、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 视觉模型成本增加 | 每张图多一次API调用 | 只对必填字段做视觉评审；缓存结果 |
| 视觉模型延迟 | 与OCR并行，不增加总延迟 | LangGraph并行节点 |
| 视觉模型不准确 | 误判字段存在性 | 视觉+LLM双重确认，冲突时人工审核 |
| 知识库检索不准 | 关键词匹配的局限 | 优先级排序；后续升级向量检索 |
| Prompt变长 | 视觉特征+RAG上下文增加token | 按字段组分轮次；上下文裁剪 |

---

## 附录：关键文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `packages/core/src/engine/extractionCore.ts` | 修改 | 删除FIELD_EXTRACTION_RULES中的癌种规则 |
| `packages/core/src/rag/knowledgeBase.ts` | 修改 | 新增tumor-normalization和visual-rule条目 |
| `packages/core/src/agents/visualReviewAgent.ts` | 新增 | 视觉评审Agent |
| `packages/core/src/engine/langgraphRecognitionWorkflow.ts` | 修改 | 新增visualReview节点，并行执行 |
| `packages/core/src/providers/providerTypes.ts` | 修改 | 新增VisualReviewProvider接口 |
| `packages/core/src/providers/httpVisualProvider.ts` | 新增 | 视觉模型Provider实现 |
| `scripts/evaluate.py` | 修改 | 删除fuzzy_match，新增视觉ground truth |
| `docs/baseline.json` | 修改 | 视觉ground truth自动生成 |
