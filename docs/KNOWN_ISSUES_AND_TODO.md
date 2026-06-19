# 已知问题与待办事项

> 记录时间：2026-06-15
> 分支：feature/optimization-v2

---

## 🔴 P0 — 必须修复

### 1. 多文档视觉审查缺失 ✅ 已修复

**问题**：当 `sourceFileIds` 包含多个文件时，视觉审查节点（visualReviewNode）直接跳过，不调用视觉模型。

**根因**：`langgraphRecognitionWorkflowV2.ts` 中 visualReviewNodeAction 只支持单张图片（`state.document.content`），多文档时无法获取所有图片的 base64。

**影响**：多文件样本（如病理报告+影像报告+基因检测）无法通过视觉模型交叉验证，OCR漏识的内容无法被补充。

**修复内容**：
- `ModelExtractionRequest` 新增 `images?: string[]`，与 `imageBase64` 互斥（images 优先）
- `httpLlmProvider` 多图生成多个 `image_url` block，超时按图数动态调整
- `visualReviewNode` 支持 `images[]`，prompt 多图时提示模型交叉验证
- `visualReviewNodeAction` 删除"多文档模式暂不支持视觉评审"skip 分支，从 `state.documents` 收集所有图片 base64

---

### 2. OCR 漏识关键内容无兜底机制 ✅ 已修复

**问题**：PaddleOCR 在某些图片上会漏掉关键诊断文字（如"病理诊断："后面的内容），而视觉模型本来能识别，但因问题1被跳过。

**典型案例**：TC012 — 四川大学华西医院病理报告，OCR 只识别到"病理诊断："，后面的实际诊断文字完全丢失。

**修复内容**：
- 新增 `detectOcrGaps`：检测 OCR 文本中关键区域关键词后内容缺失
- `CoreFieldDefinition` 新增 `criticalRegion?` 标注关键区域关键词，未标注按默认表
- `visualReviewNodeAction`：Supervisor 关闭视觉审查时，若有 OCR gap 则强制触发
- gap 信息注入 trace，便于审计兜底触发原因

---

## 🟡 P1 — 应该修复

### 3. pathologicalDiagnosis 输出过长 ✅ 已修复

**问题**：Agent 输出完整的病理描述（如"（肝脏右前叶）转移性低分化腺癌，符合肠癌肝转移"），但期望值是简短诊断名（如"转移性低分化腺癌"）。

**当前状态**：知识库已添加规则引导简短输出，但效果不稳定（LLM非确定性）。

**修复内容**：
- 新增 `pathologyNormalizer`：去部位前缀括号、取主诊断、去转移后缀
- `validationEngine` 新增 `VALUE_TOO_LONG` issue 和 `reextractionFieldKeys`
- 超长字段先尝试 normalizer 简化，简化成功不重抽；仍超长才触发重抽
- `shouldRetryExtraction` 增加第三个条件，`focusedFieldKeys` 并入重抽字段

---

### 4. cancerCategory 路径不一致 ✅ 已修复

**修正说明**：代码/schema 中实际字段为 `tumorType`/`tumorCategory`，无 `cancerCategory`（文档原描述为笔误）。

**问题**：Agent 输出"消化系统/结直肠/腺癌"，期望值是"肠道/结直肠腺癌/直肠腺癌"。路径层级和命名不统一。

**修正说明**：原描述"知识库已添加标准路径模板"与代码不符——修复前知识库无任何路径映射条目。

**修复内容**：
- `knowledgeBase.ts` + `seed-knowledge.ts` 新增 `tumorCategory` 标准路径模板条目（三级路径映射表）
- `evaluate.py` `fuzzy_match` 增强：`_path_keyword_match` 路径末级关键词匹配

---

### 5. clinicalStage 格式标准化 ✅ 已修复

**问题**：Agent 输出"ypT1cN1Mx"，期望值可能是"IV期"或"T1N1Mx"。分期系统不统一（TNM vs 临床分期）。

**修复内容**：
- 新增 `clinicalStageNormalizer`：去 yp/y 前缀、TNM 大写标准化、临床分期优先
- `validationEngine` 接入 `applyFormatPostProcess` 纯后处理（不触发重抽）
- 知识库 `clinicalStage` 条目更新优先级规则，`seed-knowledge` 补缺失条目
- `evaluate.py` `_stage_cross_match` 支持 TNM↔临床分期交叉匹配

---

## 🟢 P2 — 可以优化

### 6. 测试脚本超时机制 ✅ 已修复

**问题**：超时为固定 300s，不按图片数量调整。

**修正说明**：原描述"TC001（5张图片）每次都超时（300s × 3次重试 = 15分钟浪费）"与代码不符——
`docs/test-cases.json` 中 TC001 实为单图，`scripts/evaluate.py` 也无重试逻辑（每用例仅执行一次）。
真实问题是固定超时未考虑图片数量差异。

**修复内容**（`scripts/evaluate.py`）：
- `--timeout` 默认改为 None，未显式指定时按图片数量动态计算：`max(180, file_count × 90)` 秒
- 显式指定 `--timeout` 或 `JOB_TIMEOUT` 环境变量时用固定值（`job_timeout_explicit` 标志）
- 多图样本（如 3 张）超时自动放宽到 270s，单图 180s，避免一刀切

---

### 7. 测试结果输出缓冲 ✅ 已修复

**问题**：nohup 运行测试时，输出被块缓冲，无法实时查看进度。

**修复内容**（`scripts/evaluate.py`）：
- `main()` 入口添加 `sys.stdout.reconfigure(line_buffering=True)`，启用行缓冲
- 用户也可用 `PYTHONUNBUFFERED=1 nohup python scripts/evaluate.py ...` 达到同样效果

---

### 8. 多模态模型集成 ✅ 已修复

**问题**：当前视觉审查使用的模型和文本抽取使用的模型是同一个 provider，无法独立配置。

**修复内容**：
- `env.ts` 新增 `VISUAL_LLM_PROVIDER/MODEL/BASE_URL/API_KEY` 可选环境变量
- `JobOrchestratorConfig` 新增 `visualModelProvider?`，未配置时回退 `modelProvider`
- `JobOrchestratorInput.providerConfig` 新增 `visualProviderKey?`，单任务可指定视觉模型
- `production-services.ts` 解析可选视觉 provider，失败不阻断主流程
- `langchain`/`openai-responses` provider 补齐图片支持（此前会丢弃 imageBase64）
- 视觉审查现可独立配置为豆包 vision 等多模态模型

---

## 📊 当前准确率参考

| 轮次 | 准确率 | 完成样本 | 主要问题 |
|------|--------|----------|----------|
| 第3轮 | 58.1% | 41/45 | baseline期望值不一致 |
| 第6轮(进行中) | ~75% | 23/44 | 视觉审查被跳过 |

**预期**：修复问题1（多文档视觉审查）后，准确率预计提升 5-10%。

---

## 📁 相关文件

- 视觉审查节点：`packages/core/src/nodes/visualReviewNode.ts`
- 工作流编排：`packages/core/src/engine/langgraphRecognitionWorkflowV2.ts`
- 知识库：`packages/core/src/rag/knowledgeBase.ts`
- OCR 漏识检测：`packages/core/src/engine/workflowShared.ts`（`detectOcrGaps`）
- 病理诊断简化器：`packages/core/src/normalizers/pathologyNormalizer.ts`
- 分期标准化器：`packages/core/src/normalizers/clinicalStageNormalizer.ts`
- 校验引擎：`packages/core/src/engine/validationEngine.ts`
- Provider 多图支持：`packages/core/src/providers/httpLlmProvider.ts`、`langchainModelProvider.ts`、`openAiResponsesProvider.ts`
- 视觉模型配置：`apps/api/src/config/env.ts`、`packages/core/src/engine/jobOrchestrator.ts`、`apps/api/src/bootstrap/production-services.ts`
- 测试脚本：`scripts/evaluate.py`
- 测试基线：`docs/baseline.json`
- 测试用例：`docs/test-cases.json`
