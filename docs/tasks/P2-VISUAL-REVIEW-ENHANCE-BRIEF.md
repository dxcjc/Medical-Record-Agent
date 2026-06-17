# P2 视觉评审增强任务 Brief

**任务ID**：P2-VISUAL-REVIEW-ENHANCE  
**负责人**：Codex  
**预计时间**：2天  
**状态**：待执行（等待P1完成）

---

## 一、任务目标

充分利用视觉评审能力，将视觉结果作为候选字段合并到最终结果，提升准确率到90%+。

---

## 二、当前视觉评审流程

**当前流程**：
```
OCR文本 → LLM抽取 → 视觉评审（仅验证） → 最终结果
```

**问题**：
- 视觉评审只用于验证，未充分利用
- 视觉识别的结果没有作为候选字段
- 对勾选框、手写体等场景识别不足

---

## 三、优化后的流程

**优化流程**：
```
OCR文本 → LLM抽取 → 视觉评审（验证+补充） → 结果合并 → 最终结果
```

**优势**：
- 视觉结果作为候选字段
- 对特定字段（勾选框、手写体）使用视觉优先
- 整体准确率提升

---

## 四、需要实现的功能

### 4.1 视觉结果作为候选字段

**目标**：将视觉评审的结果作为候选字段合并到最终结果

**实现位置**：`packages/core/src/agents/visualReviewAgent.ts`

**合并逻辑**：
```typescript
interface VisualReviewResult {
  fields: Record<string, {
    value: string;
    confidence: number;
    source: 'visual';
  }>;
  validation: {
    issues: string[];
    suggestions: string[];
  };
}

function mergeVisualResults(
  extractionResult: ExtractionResult,
  visualResult: VisualReviewResult
): ExtractionResult {
  const merged = { ...extractionResult };
  
  for (const [field, visualValue] of Object.entries(visualResult.fields)) {
    const extractionValue = merged.fields[field];
    
    // 如果视觉结果有值
    if (visualValue.value) {
      // 如果抽取结果没有值，使用视觉结果
      if (!extractionValue?.value) {
        merged.fields[field] = {
          ...visualValue,
          source: 'visual'
        };
      }
      // 如果两者都有值，使用置信度更高的
      else if (visualValue.confidence > extractionValue.confidence) {
        merged.fields[field] = {
          ...visualValue,
          source: 'visual'
        };
      }
    }
  }
  
  return merged;
}
```

**验收标准**：
- [ ] 视觉结果能正确合并到最终结果
- [ ] 合并逻辑合理（置信度优先）
- [ ] 不会丢失有效数据

### 4.2 视觉优先字段配置

**目标**：对特定字段使用视觉优先策略

**实现位置**：`packages/core/src/agents/visualReviewAgent.ts`

**配置文件**：
```typescript
// config/visual-priority-fields.ts
export const VISUAL_PRIORITY_FIELDS = {
  // 勾选框字段 - 视觉识别更准确
  patientGender: {
    priority: 'visual',
    reason: '勾选项，视觉识别更准确',
    confidenceBoost: 0.2
  },
  
  // 手写体字段 - 视觉识别更准确
  patientName: {
    priority: 'visual',
    reason: '手写体，视觉识别更准确',
    confidenceBoost: 0.1
  },
  
  // 表格结构字段 - 视觉识别更准确
  testResults: {
    priority: 'visual',
    reason: '表格结构，视觉识别更准确',
    confidenceBoost: 0.15
  },
  
  // 日期字段 - 视觉识别更准确
  reportDate: {
    priority: 'visual',
    reason: '日期格式，视觉识别更准确',
    confidenceBoost: 0.1
  }
};
```

**实现逻辑**：
```typescript
function applyVisualPriority(
  field: string,
  extractionValue: FieldValue,
  visualValue: FieldValue
): FieldValue {
  const config = VISUAL_PRIORITY_FIELDS[field];
  
  if (!config) {
    // 非优先字段，使用置信度更高的
    return visualValue.confidence > extractionValue.confidence 
      ? visualValue 
      : extractionValue;
  }
  
  // 优先字段，给视觉结果加权
  const boostedVisualConfidence = Math.min(
    1.0,
    visualValue.confidence + config.confidenceBoost
  );
  
  return boostedVisualConfidence > extractionValue.confidence
    ? { ...visualValue, confidence: boostedVisualConfidence }
    : extractionValue;
}
```

**验收标准**：
- [ ] 视觉优先字段配置正确
- [ ] 优先级逻辑正确执行
- [ ] 置信度加权合理

### 4.3 视觉评审Prompt优化

**目标**：优化视觉评审Prompt，提升识别准确率

**实现位置**：`packages/core/src/agents/visualReviewAgent.ts`

**当前Prompt问题**：
1. 没有针对特定字段的指导
2. 没有示例说明
3. 没有置信度评估

**优化后的Prompt**：
```typescript
function generateVisualReviewPrompt(
  imageUrl: string,
  extractionResult: ExtractionResult
): string {
  const extractionSummary = Object.entries(extractionResult.fields)
    .map(([field, value]) => `- ${field}: ${value.value || '未识别'} (置信度: ${value.confidence})`)
    .join('\n');

  return `
你是一个医学病历视觉识别专家。请仔细观察以下病历图片，并验证/补充以下识别结果。

## 当前识别结果
${extractionSummary}

## 识别任务

### 1. 验证现有结果
检查以下字段是否正确：
- 癌种/肿瘤类型
- 患者性别（注意勾选框：□=未勾选，☑=已勾选）
- 医院名称
- 样本类型
- 报告日期
- 患者姓名
- 年龄

### 2. 补充缺失字段
如果上述字段有缺失，请从图片中识别并补充。

### 3. 特别注意
- **勾选框识别**：□表示未勾选，☑表示已勾选
- **手写体识别**：注意手写体可能有连笔、简写
- **表格识别**：注意表格结构，行和列的对应关系
- **日期格式**：可能是"2024年1月1日"或"2024-01-01"等格式

## 输出格式
请以JSON格式返回结果：
{
  "fields": {
    "cancerType": {
      "value": "肺癌",
      "confidence": 0.95,
      "reason": "图片中明确标注'肺腺癌'"
    },
    "patientGender": {
      "value": "男",
      "confidence": 0.9,
      "reason": "勾选框'男'被勾选"
    }
  },
  "validation": {
    "issues": ["医院名称识别不完整"],
    "suggestions": ["建议重新识别医院名称"]
  }
}

注意：
1. confidence范围0-1，表示你对识别结果的置信度
2. reason字段说明识别依据
3. 只返回JSON，不要有其他内容
`;
}
```

**验收标准**：
- [ ] Prompt包含验证和补充任务
- [ ] Prompt包含勾选框识别指导
- [ ] Prompt包含手写体识别指导
- [ ] Prompt包含置信度评估

---

## 五、实现步骤

### 5.1 修改 `packages/core/src/agents/visualReviewAgent.ts`

1. 添加 `mergeVisualResults` 函数
2. 添加 `applyVisualPriority` 函数
3. 优化视觉评审Prompt
4. 修改主流程，集成视觉结果合并

### 5.2 创建配置文件

1. 创建 `config/visual-priority-fields.ts`
2. 配置视觉优先字段
3. 配置置信度加权

### 5.3 测试验证

1. 单元测试：测试各个函数
2. 集成测试：测试完整流程
3. A/B测试：对比优化前后效果

---

## 六、验收标准

### 6.1 功能验收

- [ ] 视觉结果合并逻辑正确
- [ ] 视觉优先字段配置正确
- [ ] 视觉评审Prompt优化完成
- [ ] 置信度阈值可配置

### 6.2 准确率验收

- [ ] 视觉评审识别率提升 ≥ 10%
- [ ] 整体准确率提升 ≥ 5%
- [ ] 勾选框识别准确率 ≥ 90%

### 6.3 性能验收

- [ ] 视觉评审时间增加 ≤ 30秒
- [ ] 内存占用增加 ≤ 50MB

---

## 七、测试用例

### 7.1 勾选框识别测试

```bash
# 测试性别勾选框识别
curl -X POST http://127.0.0.1:3000/recognize \
  -H "Authorization: Bearer <token>" \
  -F "file=@/tmp/Medical-Record-Agent/apps/api/storage/uploads/2026-06-16/4d81baa9-260518101_.png" \
  | jq '.fields.patientGender'
```

### 7.2 手写体识别测试

```bash
# 测试手写体识别
curl -X POST http://127.0.0.1:3000/recognize \
  -H "Authorization: Bearer <token>" \
  -F "file=@/tmp/Medical-Record-Agent/apps/api/storage/uploads/2026-06-16/4d81baa9-260518101_.png" \
  | jq '.fields.patientName'
```

### 7.3 批量测试

```bash
# 运行癌种识别测试
cd /tmp/Medical-Record-Agent
python3 scripts/evaluate.py --filter-category "癌种识别"
```

---

## 八、注意事项

1. **不要破坏现有功能**：视觉评审增强应该是增量改进
2. **保持向后兼容**：添加开关，可以关闭视觉优先
3. **性能监控**：监控视觉评审时间，防止超时
4. **日志记录**：记录视觉评审的详细日志，便于调试

---

## 九、交付物

1. 修改后的 `packages/core/src/agents/visualReviewAgent.ts` 文件
2. 配置文件（视觉优先字段、置信度阈值等）
3. 优化后的视觉评审Prompt
4. 单元测试文件
5. 测试报告（准确率提升、性能影响等）
6. 更新后的本文档（状态改为"已完成"）
