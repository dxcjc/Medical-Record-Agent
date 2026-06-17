# Phase 3 任务：置信度合并 + 评估重构

## 目标
1. 实现多维度置信度合并（LLM + 视觉 + OCR质量）
2. 视觉存在性检查（视觉说"不存在"的字段标记needs_review）
3. 评估脚本支持视觉ground truth
4. 全量回归测试

## 项目路径
/tmp/Medical-Record-Agent

## 任务清单

### T1: 置信度合并逻辑

**文件**: `packages/core/src/engine/validationEngine.ts`

在 `runValidationEngine` 函数中，合并视觉置信度。

当前 `ValidationEngineResult` 已有 `normalizedCandidates`。需要在合并阶段，如果视觉评审结果可用，将视觉置信度注入。

新增接口（在 `validationEngine.ts` 顶部）：

```typescript
export interface VisualReviewInput {
  fieldAssessments: {
    fieldKey: string;
    existsInImage: boolean;
    visualValue: string | null;
    confidence: number;
  }[];
}

export interface ValidationEngineInput {
  schema: CoreSchemaDraft;
  candidates: ModelFieldCandidate[];
  visualReview?: VisualReviewInput;  // 新增：可选的视觉评审结果
}
```

修改 `runValidationEngine` 函数签名接受 `visualReview` 参数。

在 `runValidationEngine` 内部，对每个 candidate：
1. 如果有对应的 visualReview fieldAssessment：
   - 计算合并置信度：`finalConfidence = 0.6 * llmConfidence + 0.3 * visualConfidence + 0.1 * 0.8`（OCR质量默认0.8）
   - 如果 `existsInImage == false` 且 `finalConfidence > 0.5`，将该字段标记为 `needsReview`
2. 如果没有对应的 visualReview，保持原逻辑

**重要**：不要改变现有的字段验证逻辑（类型检查、枚举归一化等），只在最后追加视觉置信度合并。

### T2: 视觉存在性检查

在 validationNode 中，如果视觉评审确认某字段不存在（`existsInImage == false`），但LLM输出了该字段（`value != null`），则：
- 将该字段的 confidence 降为 0.3
- 在 fieldResults 中标记 `visualConflict: true`

### T3: 评估脚本支持视觉ground truth

**文件**: `scripts/evaluate.py`

在评估流程中，新增一个步骤：对每个测试样本，先调用视觉评审Agent生成ground truth。

```python
def generate_visual_ground_truth(client, image_path, schema_key):
    """用视觉模型确认图片上有哪些字段"""
    # 上传图片
    file_id = upload_file(client, image_path)
    # 创建识别任务（使用视觉增强的schema）
    job_id = create_job(client, [file_id], schema_key)
    # 等待完成
    result = wait_for_job(client, job_id, timeout=300)
    # 提取视觉评审结果
    return result.get('visualReview', {})
```

但这需要API返回visualReview结果。检查 `JobOrchestratorResult` 是否已包含 `visualReview` 字段。

**更简单的方案**：不改评估脚本的流程，只确保通用匹配逻辑正确。视觉ground truth作为后续优化。

当前评估脚本已经：
- 精确匹配 ✓
- 子串匹配 ✓
- null检查 ✓
- __ANY__检查 ✓
- enum归一化 ✓

不需要再加特异性逻辑。

### T4: 清理prompt中的残留硬编码

**文件**: `packages/core/src/engine/extractionCore.ts`

检查 `FIELD_EXTRACTION_RULES` 是否还有残留的癌种规则。Phase 1已删除C部分，确认A/B部分是通用规则（不涉及具体癌种名称）。

检查 `buildExtractionPrompt` 函数，确认所有领域知识都通过 `ragContext` 注入，而不是硬编码在prompt中。

### T5: 重建API + 重启服务

```bash
cd /tmp/Medical-Record-Agent
pnpm --filter @medical-record-agent/core build
pnpm --filter @medical-record-agent/api build
# 重启API
kill $(lsof -t -i:3000) 2>/dev/null; sleep 2
cd apps/api && node dist/index.js &
sleep 5
curl -s http://127.0.0.1:3000/health
```

### T6: 全量回归测试

```bash
cd /tmp/Medical-Record-Agent
API_EMAIL="admin.dev@example.local" API_PASSWORD="ChangeMe123!" python3 scripts/evaluate.py --filter-category "癌种识别" --concurrency 2
```

验收标准：
- 字段召回率 ≥ 79.6%（Phase 2水平）
- 字段精确率 ≥ 95%
- 字段F1 ≥ 87.6%

### T7: 生成审计报告

生成 `AUDIT-PHASE3.md`，包含：
1. 修改的文件列表
2. 置信度合并逻辑说明
3. 测试结果（指标对比Phase 1和Phase 2）
4. 全量回归结果
5. 是否有遗漏

## 重要约束

1. **不改变现有字段验证逻辑** — 只追加视觉置信度合并
2. **向后兼容** — 没有视觉评审结果时，行为与Phase 1完全一致
3. **评估脚本不做特异性匹配** — 只用通用匹配（精确+子串+null+__ANY__）
