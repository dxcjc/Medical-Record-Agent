# 病历识别系统技术分析报告

**文档日期**: 2026-06-16  
**分析范围**: packages/core、apps/api、Schema 定义、OCR/LLM Provider、RAG 知识库、评估体系  
**基线数据**: 固定测试集 45 个样本（66 张图片），当前识别率约 62-79%

---

## 一、当前架构分析

### 1.1 识别流程总览

```
文档上传 → OCR(PaddleOCR) → 文本拼接 → RAG知识检索 → LLM结构化抽取 → JSON解析校验 → 字段验证 → Enum归一 → 自动决策 → 写回/评估
```

核心代码路径：

| 阶段 | 文件 | 职责 |
|------|------|------|
| OCR | `providers/httpOcrProvider.ts` | 调用外部 OCR 服务，解析响应，生成质量告警 |
| 文档流水线 | `engine/documentPipeline.ts` | 单/多文档 OCR 调用、页码排序、文本拼接、部分失败容错 |
| 知识检索 | `rag/inMemoryKnowledgeRetriever.ts` | 关键词匹配 RAG，从 ~30 条知识中检索 top 5 |
| 抽取引擎 | `engine/extractionEngine.ts` | 构建 prompt、调用 LLM、解析 JSON 输出 |
| 抽取 Agent | `agents/extractionAgent.ts` | 编排知识检索 + 结构化抽取两步 |
| 字段验证 | `agents/validationAgent.ts` | 确定性规则校验（类型、枚举、置信度、证据） |
| 验证引擎 | `engine/validationEngine.ts` | 归一化 + 冲突检测 + 必填字段检查 + 整体决策 |
| 工作流编排 | `engine/langgraphRecognitionWorkflow.ts` | LangGraph 状态机，串联 9 个节点 |
| 临床归一 | `normalizers/clinicalNormalizers.ts` | 吸烟史、布尔病史、日期、列表的正则归一 |

### 1.2 Prompt 构建结构

当前 prompt 由 `buildExtractionPrompt` 函数组装，结构如下：

```
[1] 系统角色: "你是病历结构化抽取引擎，只输出 JSON，不输出解释性文字。"
[2] Schema 元数据: label + key@version
[3] 字段定义: 逐字段列出 key、label、type、enumMap、comments
[4] RAG 上下文: 编号列表（最多 5 条），或"无补充知识。"
[5] 证据要求: 3 条默认规则（必须有 evidence、不确定返回 null、不要输出 schema 外字段）
[6] 输出 JSON Schema: extractionOutputSchema 完整序列化
[7] OCR 原文: 完整 OCR 文本
[8] 视觉增强（可选）: 仅当 imageBase64 存在时追加
```

### 1.3 当前 Schema 设计

系统存在三套 Schema：

| Schema | 字段数 | 定位 |
|--------|--------|------|
| `medical-record-core` | 19 | 通用病历，3 必填 + 6 强期望 + 10 选填 |
| `pathology-report-v2` | 25 | 病理报告专用，3 必填 + 22 选填 |
| `comprehensive-tumor-evaluation` | 37 | 评估专用，覆盖文档类型、诊断、分期、治疗全维度 |

字段类型分布：

- `string` 占绝大多数（约 80%）
- `enum` 用于性别、转移状态、诊断确定性、OCR 质量等
- `list` 用于样本类型、检测项目、累及部位、转移部位等
- `date` 仅在评估 Schema 中使用
- `number`/`boolean` 几乎未使用

### 1.4 Provider 架构

```
                    ┌──────────────────┐
                    │   ProviderFactory │
                    └────────┬─────────┘
            ┌────────────────┼────────────────┐
      OCR Provider                    Model Provider
     ┌──────┴──────┐         ┌──────┬──────┬───────┐
     │    mock      │         │ mock │ lang │ http  │ openai │
     │    http      │         │      │ chain│       │responses│
     └─────────────┘         └──────┴──────┴───────┘
```

当前生产使用：
- **OCR**: PaddleOCR（通过 HTTP OCR Provider，端口 8866）
- **LLM**: 火山引擎（通过 OpenAI-compatible HTTP Provider）

### 1.5 知识库现状

`knowledgeBase.ts` 硬编码约 30 条知识：

| 类别 | 数量 | 覆盖内容 |
|------|------|----------|
| 癌种别名 | 11 | 肺/结直肠/胃/乳腺/甲状腺/黑色素瘤等中英文别名 |
| 样本类型 | 2 | 组织、血液、胸水、FFPE 等 |
| 检测项目 | 5 | 肺癌/胃肠/其他基因 panel，免疫组化 |
| 检测机构 | 1 | 燃石、吉因加、世和等 |
| 字段说明 | 12 | 性别勾选、肿瘤类型勾选、输血史、ID号等识别指导 |

检索方式：**纯关键词匹配**（非向量检索），评分规则为 fieldKey 重叠 +3、keyword 匹配 +2、title 匹配 +1。

---

## 二、性能瓶颈识别

### 2.1 OCR 阶段瓶颈

#### 瓶颈 A：OCR 文本质量不稳定

- 测试集 62 个有效样本中，OCR 文本块数 6-165 不等，平均 38.6 块
- 手写体识别错误率高：如"爱润性肺腺病"（应为"浸润性肺腺癌"）、"熊亚梯"（应为"熊亚娣"）
- 勾选框（□/☑）OCR 无法可靠区分，导致性别、治疗史等勾选字段识别困难
- **影响**: 直接影响下游 LLM 输入质量，是最基础的瓶颈

#### 瓶颈 B：多文档 OCR 串行处理

- `runMultiDocumentPipeline` 对多个文档**顺序处理**，不并行
- 多图场景（如张勇 8 张图）OCR 耗时累加
- **影响**: 多图任务延迟高

### 2.2 Prompt 工程瓶颈

#### 瓶颈 C：Prompt 信息密度过高

- 19-37 个字段定义 + JSON Schema + OCR 全文 + RAG 上下文一次性发送
- OCR 全文可能很长（165 个文本块），加上字段定义和 Schema，prompt 极长
- **影响**: 模型注意力分散，长尾字段容易遗漏；token 成本高

#### 瓶颈 D：字段定义（comments）指导不足

- 当前 comments 多为"从XX字段提取"这种被动描述
- 缺少**正例/反例**：模型不知道什么样的 OCR 文本对应什么值
- 缺少**否定指令**：如"不要将送检医生误认为患者姓名"
- **影响**: 模型缺乏足够的上下文来区分相似字段

#### 瓶颈 E：OCR 纠错依赖模型自行判断

- 当 prompt 中包含视觉增强指令时，模型被要求自行判断 OCR 错误并修正
- 但没有提供**常见 OCR 错误映射表**（如"爱润性→浸润性"、"腺病→腺癌"）
- **影响**: 纠错能力取决于模型能力，不稳定

### 2.3 Schema 设计瓶颈

#### 瓶颈 F：Schema 字段数过多导致输出退化

- `analyze_fields.py` 的统计显示 Tier 1 + Tier 2 字段约 11-12 个
- 但 `medical-record-core` 有 19 个字段，`pathology-report-v2` 有 25 个
- 已有代码注释警告："超过20个字段，可能导致 MODEL_OUTPUT_MALFORMED"
- **影响**: 字段越多，模型输出格式错误概率越高，识别率下降

#### 瓶颈 G：枚举字段的 enumMap 定义不完整

- `patientGender` 的 enumMap 只有 `male/female/unknown`，但实际文档可能出现勾选不明确的情况
- 缺少"未提及"选项，导致模型在文档无性别信息时被迫猜测
- **影响**: 模型被迫输出无效枚举值

#### 瓶颈 H：string 类型字段过于宽泛

- 大量字段定义为 `string` 类型，没有格式约束
- 如 `reportDate` 是 string，模型可能输出"2025年12月18日"、"2025.12.18"、"2025-12-18"等不同格式
- **影响**: 归一化难度高，下游比对困难

### 2.4 输出解析瓶颈

#### 瓶颈 I：全有或全无的解析策略

- `parseModelExtractionOutput` 采用 **fail-fast** 策略：任何一个字段验证失败，整个解析返回 `null`
- 这意味着即使模型正确识别了 18/19 个字段，只要有 1 个字段格式错误，全部结果丢失
- **影响**: 极大地降低了有效识别率

#### 瓶颈 J：evidence 要求过于严格

- 要求每个非 null 字段必须有 `evidence.snippet`、`evidence.startOffset`、`evidence.endOffset`
- 模型有时能正确识别字段值但无法准确定位偏移量（特别是跨行、跨块的情况）
- **影响**: 因 evidence 不合格导致有效结果被丢弃

### 2.5 知识库瓶颈

#### 瓶颈 K：知识库规模小且检索方式原始

- 仅 ~30 条硬编码知识，关键词匹配检索
- 不支持向量相似度、不支持语义扩展
- 知识条目内容简短，缺少详细的识别指导（如正则模式、常见变体）
- **影响**: RAG 上下文对识别的辅助效果有限

#### 瓶颈 L：反馈闭环未打通

- 人工反馈只写入 `FeedbackSubmission` 表，**不影响知识库**
- `OPTIMIZATION-REQUIREMENTS.md` 明确指出："反馈管理是数据孤岛"
- **影响**: 无法从纠错中积累经验，重复犯相同错误

### 2.6 后处理瓶颈

#### 瓶颈 M：临床归一化覆盖不足

- `clinicalNormalizers.ts` 只有 4 个归一函数：吸烟史、布尔病史、日期、列表
- 缺少癌种归一（如"非小细胞肺癌 NSCLC"→统一格式）、分期归一、免疫组化归一
- **影响**: 相同含义的不同表述无法被归一化，影响下游比对

### 2.7 瓶颈影响程度排序

| 优先级 | 瓶颈 | 影响面 | 修复难度 |
|--------|------|--------|----------|
| P0 | I. 全有或全无解析 | 单字段错误导致全部丢失 | 低 |
| P0 | F. Schema 字段过多 | 格式错误概率随字段数上升 | 低 |
| P1 | D. 字段指导不足 | 模型混淆相似字段 | 中 |
| P1 | C. Prompt 信息密度 | 长尾字段遗漏 | 中 |
| P1 | A. OCR 质量 | 输入垃圾→输出垃圾 | 高 |
| P2 | E. 缺少 OCR 错误映射 | 纠错不稳定 | 低 |
| P2 | K. 知识库薄弱 | RAG 辅助效果有限 | 中 |
| P2 | M. 归一化不足 | 下游比对困难 | 中 |
| P3 | B. 多文档串行 | 多图延迟高 | 低 |
| P3 | L. 反馈未闭环 | 无法积累经验 | 高 |
| P3 | J. Evidence 过严 | 有效结果被丢弃 | 低 |

---

## 三、优化方案对比

### 方案一：Prompt 优化 + 后处理规则（推荐优先实施）

**核心思路**: 不改架构，通过优化 prompt 质量和增加后处理规则来提升识别率。

#### 1. Prompt 结构优化

**问题**: 当前 prompt 将所有字段定义、JSON Schema、OCR 全文一次性发送，信息密度过高。

**优化**:
- **分层 prompt**: 将字段分为"核心层"和"扩展层"，先抽取核心字段，再用核心结果辅助抽取扩展字段
- **精简 JSON Schema**: 从 prompt 中移除完整的 `extractionOutputSchema`，改用简化的字段列表格式指令（当前 Schema 占用大量 token）
- **增加 few-shot 示例**: 为每个字段类型提供 1-2 个正例和反例

**预计收益**: 识别率提升 5-10%

#### 2. 字段 Comments 增强

**问题**: 当前 comments 过于简单，缺少识别指导。

**优化**:
```json
{
  "key": "patientName",
  "comments": [
    "从'姓名：'后提取",
    "正例：'姓名：张三' → '张三'",
    "反例：'送检医师：李四' 不是患者姓名",
    "手写体可能识别不准，保留原始OCR文本",
    "如果文档中同时出现多个姓名，取患者信息区域的姓名"
  ]
}
```

**预计收益**: 减少字段混淆，提升 3-5%

#### 3. 后处理规则增加

**当前状态**: 仅 4 个归一函数。

**新增规则**:
- 日期格式归一: 支持 `YYYY.MM.DD`、`YYYY/MM/DD`、`YYYY年MM月DD日` → `YYYY-MM-DD`
- 癌种归一: "非小细胞肺癌" / "NSCLC" / "肺腺癌" 统一术语
- 分期归一: 提取 TNM 模式，标准化格式
- 姓名清洗: 去除 OCR 噪声字符（如标点、空格）
- 医院名归一: 去除"病理科"、"检验科"等科室后缀

**预计收益**: 提升 3-5%

#### 实现复杂度

| 项目 | 复杂度 | 工期 | 风险 |
|------|--------|------|------|
| Prompt 精简 | 低 | 1-2 天 | 低 |
| Comments 增强 | 低 | 1 天 | 低 |
| 后处理规则 | 中 | 3-5 天 | 低 |
| **合计** | **低-中** | **5-8 天** | **低** |

---

### 方案二：知识库辅助 + 字段级 RAG（中期方案）

**核心思路**: 扩充知识库，从"关键词匹配"升级到"字段级语义检索"，为每个字段提供精准的识别上下文。

#### 1. 知识库扩充

**当前**: ~30 条硬编码知识。

**目标**: 300+ 条结构化知识，覆盖：

| 类别 | 目标条数 | 内容 |
|------|----------|------|
| 癌种术语 | 50+ | 中英文名、缩写、亚型、ICD编码 |
| 样本类型 | 30+ | 各种标本类型、采集方式、保存方式 |
| 基因检测 | 60+ | 基因名、突变类型、检测方法、panel名称 |
| 医院机构 | 100+ | 全国主要医院全称/简称/曾用名 |
| 免疫组化 | 40+ | 标记物名称、阳性/阴性表达含义 |
| 治疗方式 | 30+ | 手术/化疗/放疗/靶向/免疫治疗具体方案 |

**数据来源**:
- 反馈系统积累的修正数据（需先打通闭环）
- 医学术语标准库（ICD-10、SNOMED CT 子集）
- 测试集 OCR 结果中的高频错误模式

#### 2. 字段级 RAG

**当前**: 用全部字段 key + OCR 全文作为检索 query，返回 top 5 通用知识。

**优化**:
- 按字段拆分检索：每个目标字段独立检索相关知识
- 为高频混淆字段（patientName vs referringDoctor）提供专门的消歧知识
- 检索结果直接注入对应字段的 prompt 段落

#### 3. 反馈闭环打通

**当前**: 反馈写入 `FeedbackSubmission`，不影响后续识别。

**优化**:
- 人工修正值自动转化为知识条目候选
- 经审核后写入 `KnowledgeEntry` 表
- 后续识别时 RAG 可检索到历史修正

**实现路径**:
1. 后端: `POST /feedback/:id/approve` → 写入 KnowledgeEntry
2. 前端: 反馈列表增加"批准/拒绝"操作
3. RAG: `database-knowledge-retriever.ts` 增加从数据库查询知识的能力

#### 实现复杂度

| 项目 | 复杂度 | 工期 | 风险 |
|------|--------|------|------|
| 知识库数据整理 | 中 | 5-7 天 | 低 |
| 字段级 RAG 改造 | 中 | 3-5 天 | 中 |
| 反馈闭环 | 中 | 3-5 天 | 低 |
| **合计** | **中** | **11-17 天** | **中** |

---

### 方案三：输出格式优化 + 容错解析（推荐优先实施）

**核心思路**: 降低模型输出的格式约束，增加解析容错能力，避免单字段错误导致全部丢失。

#### 1. 解析容错改造

**当前**: `parseModelExtractionOutput` 任一字段验证失败 → 返回 null。

**优化**: 采用**逐字段容错**策略：

```typescript
// 伪代码
function parseModelExtractionOutput(raw): ModelFieldCandidate[] | null {
  const parsed = JSON.parse(raw);
  if (!parsed.fields || !Array.isArray(parsed.fields)) return null; // 根结构仍需严格
  
  const validFields = [];
  for (const field of parsed.fields) {
    try {
      validateField(field);
      validFields.push(field);
    } catch (e) {
      // 记录警告但不丢弃整个结果
      warnings.push({ fieldKey: field.fieldKey, error: e.message });
    }
  }
  return validFields.length > 0 ? validFields : null;
}
```

**预计收益**: 识别率提升 8-15%（当前因单字段错误丢失的有效结果占比估计 10-20%）

#### 2. Evidence 要求分级

**当前**: 所有字段统一要求 evidence snippet + offset。

**优化**:
- **必填字段**: 严格要求 evidence（snippet + offset + pageNumber）
- **强期望字段**: 要求 evidence snippet，offset 允许缺失
- **选填字段**: 仅要求 value，evidence 可选

#### 3. JSON Schema 约束优化

**当前**: 使用 `response_format: { type: "json_object" }`（仅约束根类型为 JSON）。

**优化**: 对于支持 structured output 的模型：
- 使用 LangChain 的 `withStructuredOutput(extractionOutputSchema)` 强制约束
- 对于不支持的模型，在 prompt 中用更简洁的格式指令替代完整 JSON Schema

#### 4. 输出格式简化

**当前输出格式**:
```json
{
  "fields": [
    {
      "fieldKey": "patientName",
      "value": "张三",
      "rawValue": "张三",
      "confidence": 0.95,
      "evidence": [{"snippet": "姓名：张三", "startOffset": 0, "endOffset": 5}]
    }
  ]
}
```

**简化方案**（降低模型格式负担）:
```json
{
  "patientName": {"v": "张三", "c": 0.95, "e": "姓名：张三"},
  "tumorType": {"v": "肺腺癌", "c": 0.9, "e": "病理诊断：浸润性肺腺癌"}
}
```

字段 key 直接作为 JSON key，减少一层嵌套；value/confidence/evidence 缩写为 v/c/e。解析后再转换为标准格式。

**预计收益**: 格式错误率降低 50%+

#### 实现复杂度

| 项目 | 复杂度 | 工期 | 风险 |
|------|--------|------|------|
| 容错解析改造 | 低 | 1-2 天 | 低 |
| Evidence 分级 | 低 | 1 天 | 低 |
| 输出格式简化 | 中 | 2-3 天 | 中 |
| Structured Output | 低 | 1 天 | 低 |
| **合计** | **低-中** | **5-7 天** | **低-中** |

---

### 方案四：模型选择优化（补充方案）

**核心思路**: 不同模型在中文医疗文档理解、JSON 格式遵从、长文本处理方面能力差异显著。

#### 当前模型能力评估

| 能力维度 | 要求 | 备注 |
|----------|------|------|
| 中文理解 | 高 | 病历全中文，含手写体纠错 |
| 结构化输出 | 高 | 必须严格输出 JSON |
| 长文本处理 | 高 | OCR 全文 + prompt 可能超 8K tokens |
| 医学知识 | 中 | 需理解癌种、分期、基因检测等专业术语 |
| 视觉理解 | 中 | 勾选框识别、手写体纠错 |

#### 可选模型对比

| 模型 | 中文能力 | 结构化输出 | 长文本 | 视觉 | 成本 |
|------|----------|-----------|--------|------|------|
| GPT-4o | ★★★★ | ★★★★★ | ★★★★ | ★★★★ | 高 |
| GPT-4o-mini | ★★★ | ★★★★ | ★★★ | ★★★ | 中 |
| Claude Sonnet | ★★★★ | ★★★★ | ★★★★★ | ★★★★ | 中-高 |
| 火山引擎（当前） | ★★★ | ★★★ | ★★★ | ★★★ | 低 |
| DeepSeek-V3 | ★★★★★ | ★★★★ | ★★★★ | ★★ | 低 |
| Qwen-Max | ★★★★★ | ★★★★ | ★★★★ | ★★★ | 中 |

#### 优化建议

1. **主力模型**: 选择中文能力最强的模型（DeepSeek-V3 或 Qwen-Max）作为默认
2. **视觉增强**: 当有 imageBase64 时，切换到视觉能力强的模型（GPT-4o 或 Claude Sonnet）
3. **降级策略**: 主力模型超时/限流时，自动切换备用模型
4. **A/B 测试**: 通过评估框架对比不同模型在固定测试集上的表现

#### 实现复杂度

| 项目 | 复杂度 | 工期 | 风险 |
|------|--------|------|------|
| 多模型配置 | 低 | 1-2 天 | 低 |
| 降级策略 | 中 | 2-3 天 | 中 |
| A/B 评估 | 低 | 1 天 | 低 |
| **合计** | **低-中** | **4-6 天** | **低-中** |

---

### 方案五：Schema 精简 + 文档类型路由（推荐中期实施）

**核心思路**: 用更少的字段覆盖 80% 的场景，对不同类型文档使用不同 Schema。

#### 1. Schema 精简

**基于 OCR 统计的字段分层**:

| 层级 | 字段 | 出现率 | 建议 |
|------|------|--------|------|
| Tier 1 必填 | 患者姓名、癌种、医院名称 | >50% | 保留，设为 required |
| Tier 2 强期望 | 临床诊断、病理诊断、性别、样本类型、检测项目、报告日期、送检医师 | 30-50% | 保留，设为 expected |
| Tier 3 选填 | 年龄、科室、病理号、分期、转移、免疫组化 | <30% | 保留但降低优先级 |
| 移除 | 输血史、家族史、高血压、糖尿病 | 极低 | 从核心 Schema 移除 |

**精简后**: `medical-record-core` 从 19 字段减至 12 字段。

#### 2. 文档类型路由

**问题**: 一份病理报告和一份基因检测报告使用同一 Schema，导致大量字段为空。

**优化**:
- **第一步**: 轻量分类（用规则或小模型判断文档类型）
- **第二步**: 根据类型选择对应 Schema
  - 病理报告 → `pathology-report-v2`
  - 基因检测 → `gene-test-report`（新建）
  - 申请单 → `referral-form`（新建）
  - 混合/不确定 → `medical-record-core`（通用）

#### 3. Schema 字段约束增强

- 日期字段从 `string` 改为 `date` 类型，配合 `normalizeDateText` 归一
- 分期字段增加 pattern 约束（如 TNM 格式）
- 必填字段减少到 3 个（patientName + tumorType + hospitalName），降低 MISSING_EVIDENCE 触发率

#### 实现复杂度

| 项目 | 复杂度 | 工期 | 风险 |
|------|--------|------|------|
| Schema 精简 | 低 | 1-2 天 | 低 |
| 文档类型路由 | 高 | 5-8 天 | 中 |
| 字段约束增强 | 低 | 1-2 天 | 低 |
| **合计** | **中** | **7-12 天** | **中** |

---

## 四、推荐方案与实施路线

### 4.1 推荐路线：分三阶段递进

```
Phase 1（1-2周）→ Phase 2（2-3周）→ Phase 3（3-4周）
   快速收益           架构优化           智能化提升
  识别率 62-79%  →   识别率 75-88%  →   识别率 85-95%
```

### 4.2 Phase 1：快速收益（1-2 周）

**目标**: 用最小改动获取最大识别率提升，预计从 62-79% 提升到 75-88%。

| 序号 | 任务 | 来源方案 | 优先级 | 工期 |
|------|------|----------|--------|------|
| 1 | 解析容错改造（逐字段容错） | 方案三 | P0 | 1-2 天 |
| 2 | Schema 精简（19→12 字段） | 方案五 | P0 | 1-2 天 |
| 3 | Evidence 要求分级 | 方案三 | P1 | 1 天 |
| 4 | Prompt 精简（移除冗余 JSON Schema） | 方案一 | P1 | 1-2 天 |
| 5 | 字段 Comments 增加正例/反例 | 方案一 | P1 | 1 天 |
| 6 | 日期/姓名/医院后处理规则 | 方案一 | P2 | 2-3 天 |

**关键代码改动**:

1. `extractionEngine.ts` → `parseModelExtractionOutput` 改为逐字段容错
2. `schema-medical-record-core.json` → 精简字段数，增强 comments
3. `clinicalNormalizers.ts` → 新增日期归一、姓名清洗、医院名归一
4. `extractionEngine.ts` → `buildExtractionPrompt` 精简 prompt 结构

### 4.3 Phase 2：架构优化（2-3 周）

**目标**: 打通反馈闭环，扩充知识库，优化模型选择。

| 序号 | 任务 | 来源方案 | 优先级 | 工期 |
|------|------|----------|--------|------|
| 1 | 反馈闭环打通（审核→知识库） | 方案二 | P1 | 3-5 天 |
| 2 | 知识库扩充（30→300+ 条） | 方案二 | P1 | 5-7 天 |
| 3 | 多模型支持 + 降级策略 | 方案四 | P2 | 3-5 天 |
| 4 | 输出格式简化（可选） | 方案三 | P2 | 2-3 天 |

### 4.4 Phase 3：智能化提升（3-4 周）

**目标**: 通过文档路由和高级 RAG 实现精细化识别。

| 序号 | 任务 | 来源方案 | 优先级 | 工期 |
|------|------|----------|--------|------|
| 1 | 文档类型路由 | 方案五 | P2 | 5-8 天 |
| 2 | 字段级 RAG | 方案二 | P2 | 3-5 天 |
| 3 | A/B 评估框架 | 方案四 | P3 | 2-3 天 |
| 4 | OCR 预处理（图像增强） | 方案一 | P3 | 5-7 天 |

---

## 五、实施复杂度总评

### 5.1 各方案 ROI 对比

| 方案 | 预计收益 | 工期 | 复杂度 | ROI | 建议 |
|------|----------|------|--------|-----|------|
| 方案一：Prompt + 后处理 | +8-15% | 5-8 天 | 低 | ★★★★★ | 立即实施 |
| 方案二：知识库 + RAG | +5-10% | 11-17 天 | 中 | ★★★ | Phase 2 |
| 方案三：输出格式优化 | +8-15% | 5-7 天 | 低-中 | ★★★★★ | 立即实施 |
| 方案四：模型选择 | +3-8% | 4-6 天 | 低-中 | ★★★★ | Phase 2 |
| 方案五：Schema 精简 | +5-10% | 7-12 天 | 中 | ★★★★ | Phase 1 部分 |

### 5.2 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 解析容错引入新 bug | 低 | 中 | 保留原有严格模式作为 fallback，通过评估框架回归 |
| Schema 精简导致信息丢失 | 低 | 低 | 精简只是移除低频字段，不删除已有信息 |
| 模型切换导致输出格式变化 | 中 | 中 | 使用统一的 `extractionOutputSchema` 约束，评估框架验证 |
| 知识库扩充数据质量 | 中 | 中 | 建立知识条目审核流程 |
| Prompt 优化效果不明显 | 中 | 低 | 通过 A/B 测试对比，可回退 |

### 5.3 关键指标监控

建议建立以下指标来衡量优化效果：

| 指标 | 定义 | 当前基线 | Phase 1 目标 | Phase 2 目标 |
|------|------|----------|-------------|-------------|
| 字段识别率 | 正确识别字段 / 总字段 | 62-79% | 75-88% | 85-95% |
| 格式错误率 | MODEL_OUTPUT_MALFORMED / 总任务 | 估计 10-15% | <5% | <2% |
| 必填字段覆盖率 | 必填字段识别 / 必填字段总数 | 估计 80% | >95% | >98% |
| 平均置信度 | 所有字段平均 confidence | 估计 0.7 | >0.75 | >0.8 |
| 需人工复核率 | needs_review 任务 / 总任务 | 估计 40% | <25% | <15% |
| 多图任务成功率 | 多图完成 / 多图总数 | 待测 | >90% | >95% |

---

## 六、技术实现细节参考

### 6.1 解析容错改造

目标文件: `packages/core/src/engine/extractionEngine.ts`

当前 `parseModelExtractionOutput` 函数（约第 213-304 行）的改动要点：
- 保持根结构校验（`fields` 必须是数组）
- 将逐字段校验从 "fail-fast" 改为 "collect-valid"
- 返回值类型从 `ModelFieldCandidate[] | null` 保持不变，但只包含通过校验的字段
- 新增 `warnings` 输出记录被跳过的字段及原因

### 6.2 Prompt 精简方向

目标文件: `packages/core/src/engine/extractionEngine.ts` 的 `buildExtractionPrompt` 函数

- 移除 prompt 中的完整 `extractionOutputSchema` JSON（约 40 行），改为简化的格式说明
- 将字段定义格式从详细描述改为表格化（更紧凑）
- 增加 2-3 个 few-shot 示例

### 6.3 Schema 精简参考

目标文件: `schema-medical-record-core.json`

保留字段（12 个）:
1. patientName（必填）
2. tumorType（必填）
3. hospitalName（必填）
4. clinicalDiagnosis
5. pathologicalDiagnosis
6. patientGender
7. patientAge
8. sampleType
9. testItems
10. reportDate
11. referringDoctor
12. staging

移除字段（7 个）: department、pathologyNo、treatmentHistory、metastasis、immunohistochemistry、grossDescription、specialNotes

---

## 附录 A：核心文件索引

| 文件 | 路径 | 作用 |
|------|------|------|
| 抽取引擎 | `packages/core/src/engine/extractionEngine.ts` | prompt 构建 + LLM 调用 + JSON 解析 |
| 抽取核心 | `packages/core/src/engine/extractionCore.ts` | 抽取引擎的简化版 |
| 文档流水线 | `packages/core/src/engine/documentPipeline.ts` | OCR 调用 + 文本拼接 |
| 工作流 | `packages/core/src/engine/langgraphRecognitionWorkflow.ts` | LangGraph 状态机编排 |
| 验证引擎 | `packages/core/src/engine/validationEngine.ts` | 字段验证 + 归一化 + 冲突检测 |
| 验证 Agent | `packages/core/src/agents/validationAgent.ts` | 确定性规则校验 |
| 抽取 Agent | `packages/core/src/agents/extractionAgent.ts` | 知识检索 + 抽取编排 |
| HTTP LLM | `packages/core/src/providers/httpLlmProvider.ts` | OpenAI-compatible LLM 调用 |
| HTTP OCR | `packages/core/src/providers/httpOcrProvider.ts` | OCR 服务调用 |
| 知识库 | `packages/core/src/rag/knowledgeBase.ts` | 硬编码医学知识 |
| 知识检索 | `packages/core/src/rag/inMemoryKnowledgeRetriever.ts` | 关键词匹配检索 |
| 临床归一 | `packages/core/src/normalizers/clinicalNormalizers.ts` | 吸烟史/病史/日期/列表归一 |
| Schema 校验 | `packages/core/src/schemas/schemaValidator.ts` | Schema 结构定义与校验 |
| 核心 Schema | `schema-medical-record-core.json` | 通用病历 19 字段定义 |
| 病理 Schema | `schema-pathology-report-v2.json` | 病理报告 25 字段定义 |
| 评估 Schema | `docs/evaluation/comprehensive-tumor-evaluation.schema.json` | 评估 37 字段定义 |
| 字段分析 | `analyze_fields.py` | OCR 字段频率统计脚本 |
| Schema 优化 | `optimize_schema.py` | Schema v2 + 知识库部署脚本 |

## 附录 B：测试集概况

| 分组 | 样本数 | 文件数 | 测试意图 |
|------|--------|--------|----------|
| 不同癌种解读匹配 | 10 | 11 | 膀胱癌、肾癌、胶质瘤等诊断匹配 |
| 不同类型病理报告 | 10 | 11 | 北医三院、南京鼓楼等病理报告 |
| 上传的不同类型图片 | 7 | 9 | 手写申请单、勾选治疗史、基因报告 |
| 药厂测试 | 3 | 3 | 模糊、清晰、倾斜图片 |
| 资料多样本测试 | 5 | 22 | 多页资料、用药多、期望截图 |
| 基因检测 | 3 | 3 | 基因检测报告 |
| 手术分期 | 4 | 4 | 标准分期、只有T/N、未提及 |
| 多部位乳腺癌 | 3 | 3 | 多部位诊断 |

OCR 统计: 62 个有效样本，文本块 6-165 个，平均 38.6 块/样本。
