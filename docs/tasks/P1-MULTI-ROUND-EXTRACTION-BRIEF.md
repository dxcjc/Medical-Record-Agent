# P1 多轮抽取任务 Brief

**任务ID**：P1-MULTI-ROUND-EXTRACTION  
**负责人**：Codex  
**预计时间**：2天  
**状态**：待执行（等待P0完成）

---

## 一、任务目标

实现多轮抽取机制，针对缺失字段做第二轮定向抽取，提升整体准确率到85%+。

---

## 二、当前抽取流程

**当前流程**：
```
OCR文本 → LLM抽取 → 结构化JSON
```

**问题**：
- 第一轮抽取可能遗漏某些字段
- 缺失字段没有补救机制
- 整体准确率受限于单次抽取

---

## 三、优化后的流程

**优化流程**：
```
OCR文本 → 第一轮抽取 → 缺失字段检测 → 第二轮抽取 → 结果合并
```

**优势**：
- 针对缺失字段做定向抽取
- 提升缺失字段的召回率
- 整体准确率提升

---

## 四、需要实现的功能

### 4.1 缺失字段检测

**目标**：识别第一轮抽取中缺失或低置信度的字段

**实现位置**：`apps/api/src/engine/extractionCore.ts`

**检测逻辑**：
```typescript
interface ExtractionResult {
  fields: Record<string, {
    value: string;
    confidence: number;
    source: 'ocr' | 'llm' | 'visual';
  }>;
}

function detectMissingFields(result: ExtractionResult): string[] {
  const requiredFields = [
    'cancerType',      // 癌种
    'patientGender',   // 性别
    'hospitalName',    // 医院
    'sampleType',      // 样本类型
    'reportDate',      // 报告日期
    'patientName',     // 患者姓名
    'patientAge',      // 年龄
  ];
  
  return requiredFields.filter(field => {
    const fieldData = result.fields[field];
    // 字段为空或置信度低于0.3
    return !fieldData?.value || fieldData.confidence < 0.3;
  });
}
```

**验收标准**：
- [ ] 能正确识别缺失字段
- [ ] 能正确识别低置信度字段
- [ ] 检测逻辑无误

### 4.2 第二轮抽取Prompt生成

**目标**：针对缺失字段生成专门的抽取Prompt

**实现位置**：`apps/api/src/engine/extractionCore.ts`

**Prompt模板**：
```typescript
function generateSecondRoundPrompt(
  ocrText: string,
  missingFields: string[]
): string {
  const fieldDescriptions: Record<string, string> = {
    cancerType: '肿瘤类型/癌种（如：肺癌、胃癌、乳腺癌等）',
    patientGender: '患者性别（男/女）',
    hospitalName: '医院名称',
    sampleType: '样本类型（组织/血液/骨髓等）',
    reportDate: '报告日期',
    patientName: '患者姓名',
    patientAge: '患者年龄',
  };

  const fieldList = missingFields
    .map(field => `- ${fieldDescriptions[field] || field}`)
    .join('\n');

  return `
你是一个医学病历识别专家。请从以下OCR文本中提取指定字段。

## 需要提取的字段
${fieldList}

## OCR文本
${ocrText}

## 输出格式
请以JSON格式返回结果，只包含上述字段。如果无法识别某个字段，返回空字符串。
示例：
{
  "cancerType": "肺癌",
  "patientGender": "男",
  "hospitalName": "北京协和医院"
}

注意：
1. 只返回JSON，不要有其他内容
2. 字段值尽量简洁，不要包含多余信息
3. 如果无法识别，返回空字符串
`;
}
```

**验收标准**：
- [ ] Prompt能正确生成
- [ ] Prompt包含所有缺失字段
- [ ] Prompt格式正确

### 4.3 结果合并与冲突处理

**目标**：合并两轮抽取结果，处理冲突

**实现位置**：`apps/api/src/engine/extractionCore.ts`

**合并策略**：
```typescript
function mergeResults(
  firstRound: ExtractionResult,
  secondRound: ExtractionResult
): ExtractionResult {
  const merged = { ...firstRound };
  
  for (const [field, secondValue] of Object.entries(secondRound.fields)) {
    const firstValue = merged.fields[field];
    
    // 如果第二轮有结果
    if (secondValue.value) {
      // 如果第一轮没有结果，使用第二轮
      if (!firstValue?.value) {
        merged.fields[field] = secondValue;
      }
      // 如果两轮都有结果，使用置信度更高的
      else if (secondValue.confidence > firstValue.confidence) {
        merged.fields[field] = secondValue;
      }
    }
  }
  
  return merged;
}
```

**冲突处理规则**：
1. 如果只有一轮有结果，使用该结果
2. 如果两轮都有结果，使用置信度更高的
3. 如果置信度相同，使用第一轮的结果（保守策略）

**验收标准**：
- [ ] 合并逻辑正确
- [ ] 冲突处理合理
- [ ] 不会丢失有效数据

### 4.4 超时与降级机制

**目标**：防止第二轮抽取超时导致整体失败

**实现位置**：`apps/api/src/engine/extractionCore.ts`

**超时策略**：
```typescript
async function secondRoundExtraction(
  ocrText: string,
  missingFields: string[],
  timeoutMs: number = 60000 // 60秒超时
): Promise<ExtractionResult | null> {
  try {
    const prompt = generateSecondRoundPrompt(ocrText, missingFields);
    
    // 设置超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const result = await callLLM(prompt, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    return parseResult(result);
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('第二轮抽取超时，使用第一轮结果');
      return null;
    }
    throw error;
  }
}
```

**降级策略**：
1. 如果第二轮抽取超时，使用第一轮结果
2. 如果第二轮抽取失败，使用第一轮结果
3. 如果第二轮结果质量差（置信度<0.2），使用第一轮结果

**验收标准**：
- [ ] 超时机制正确实现
- [ ] 降级策略合理
- [ ] 不会导致整体失败

---

## 五、实现步骤

### 5.1 修改 `apps/api/src/engine/extractionCore.ts`

1. 添加 `detectMissingFields` 函数
2. 添加 `generateSecondRoundPrompt` 函数
3. 添加 `mergeResults` 函数
4. 添加 `secondRoundExtraction` 函数
5. 修改主抽取流程，集成多轮抽取

### 5.2 修改配置

1. 添加多轮抽取开关（默认开启）
2. 添加超时配置（默认60秒）
3. 添加缺失字段阈值配置（默认0.3）

### 5.3 测试验证

1. 单元测试：测试各个函数
2. 集成测试：测试完整流程
3. 性能测试：测试超时机制

---

## 六、验收标准

### 6.1 功能验收

- [ ] 缺失字段检测正确
- [ ] 第二轮Prompt生成正确
- [ ] 结果合并逻辑正确
- [ ] 超时机制正确
- [ ] 降级策略合理

### 6.2 性能验收

- [ ] 第二轮抽取时间 ≤ 60秒
- [ ] 整体抽取时间增加 ≤ 70秒
- [ ] 内存占用增加 ≤ 50MB

### 6.3 准确率验收

- [ ] 整体准确率提升 ≥ 10%
- [ ] 缺失字段召回率提升 ≥ 20%

---

## 七、测试用例

### 7.1 单样本测试

```bash
# 测试单个样本
curl -X POST http://127.0.0.1:3000/recognize \
  -H "Authorization: Bearer <token>" \
  -F "file=@/tmp/Medical-Record-Agent/apps/api/storage/uploads/2026-06-16/4d81baa9-260518101_.png"
```

### 7.2 批量测试

```bash
# 运行癌种识别测试
cd /tmp/Medical-Record-Agent
python3 scripts/evaluate.py --filter-category "癌种识别"
```

### 7.3 性能测试

```bash
# 测试超时机制
time curl -X POST http://127.0.0.1:3000/recognize \
  -H "Authorization: Bearer <token>" \
  -F "file=@/tmp/Medical-Record-Agent/apps/api/storage/uploads/2026-06-16/4d81baa9-260518101_.png"
```

---

## 八、注意事项

1. **不要破坏现有功能**：多轮抽取应该是增量改进
2. **保持向后兼容**：添加开关，可以关闭多轮抽取
3. **性能监控**：监控第二轮抽取时间，防止超时
4. **日志记录**：记录多轮抽取的详细日志，便于调试

---

## 九、交付物

1. 修改后的 `apps/api/src/engine/extractionCore.ts` 文件
2. 配置文件（多轮抽取开关、超时配置等）
3. 单元测试文件
4. 测试报告（准确率提升、性能影响等）
5. 更新后的本文档（状态改为"已完成"）
