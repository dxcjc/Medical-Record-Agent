# Phase 1 任务：知识库驱动改造

## 目标
把extractionCore.ts中的癌种硬编码规则迁移到知识库，清理evaluate.py的特异性匹配逻辑，实现"新增癌种零代码改动"。

## 项目路径
/tmp/Medical-Record-Agent

## 任务清单

### T1: 新增癌种标准化知识库条目

**文件**: `packages/core/src/rag/knowledgeBase.ts`

在 `createDefaultMedicalKnowledgeBase()` 的 entries 数组末尾（`field-description-document-info` 条目之后，`]` 之前）新增以下条目：

```typescript
// ========== 癌种标准化规则（从 extractionCore.ts 迁移） ==========
{
  id: "tumor-normalization-rules",
  kind: "field-description",
  title: "肿瘤类型标准化映射规则",
  content: `肿瘤类型(tumorType)标准化规则——将病理诊断中的组织学类型映射为标准癌种名称：
    1. 尿路上皮癌（送检部位为膀胱）→ 膀胱癌
    2. 肾细胞癌 → 肾癌（标准名称）
    3. 胃肠道间质瘤 → 胃肠道间质瘤（4字'胃肠道'，不要简写为'胃肠间质瘤'）
    4. 胃的腺癌 → 胃腺癌（不要简写为'胃癌'）
    5. 食管鳞状细胞癌 → 食管癌（不要细化亚型）
    6. 弥漫性胶质瘤 → 胶质瘤
    7. 横纹肌肉瘤 → 横纹肌肉瘤（不是'癌'，是肉瘤）
    8. 非霍奇金淋巴瘤/DLBCL → 非霍奇金淋巴瘤
    9. （距肛缘XXcm处）腺癌 → 肛缘肠癌（部位推断：距肛缘=肛缘区域）
    10. （胰体尾）腺癌 → 胰腺癌
    11. （胃小弯）腺癌 → 胃腺癌
    规则：器官部位 + 癌/瘤后缀 = 标准名称。只输出标准名称，不输出原始组织学亚型。`,
  keywords: ["肿瘤类型", "标准化", "癌种", "tumorType", "映射", "尿路上皮癌", "肾细胞癌", "食管鳞状细胞癌", "胃肠道间质瘤", "非霍奇金淋巴瘤", "弥漫性胶质瘤", "横纹肌肉瘤", "肛缘", "胰腺"],
  fieldKeys: ["tumorType"]
},
{
  id: "tumor-normalization-anti-rules",
  kind: "field-description",
  title: "肿瘤类型标准化禁止规则",
  content: `癌种不细化规则：
    - 文档只写'肺癌'不要自行细化为'非小细胞肺癌'或'肺腺癌'
    - 文档只写'胃癌'不要自行细化为'胃腺癌'（除非文档明确写'腺癌'）
    - 只有当文档明确写出亚型时才可以使用更具体的名称
    - 文档写'倾向腺癌'不要改为'腺癌'（除非后续有补充诊断确认）
    - 文档写'考虑...来源'不要改为确定性诊断`,
  keywords: ["不细化", "不臆造", "倾向", "考虑", "tumorType"],
  fieldKeys: ["tumorType"]
},
{
  id: "field-description-patient-name-visual",
  kind: "field-description",
  title: "患者姓名视觉识别规则",
  content: `患者姓名提取优先级：
    1. '姓名：XXX'、'患者姓名：XXX'、'病人姓名：XXX' 标签后的值
    2. 文档头部或登记信息中的姓名（通常与年龄同行）
    3. 多文档场景下，以包含'姓名：'标签的文档为准
    注意：不要将送检医生、报告医生、审核医生的姓名误认为患者姓名。
    如果OCR文本中没有患者姓名，查看图片页眉、页脚区域。`,
  keywords: ["患者姓名", "姓名", "patientName", "页眉", "页脚"],
  fieldKeys: ["patientName"]
},
{
  id: "field-description-hospital-name-visual",
  kind: "field-description",
  title: "医院名称视觉识别规则",
  content: `医院名称提取优先级：
    1. 文档头部/抬头的医院名称
    2. '送检单位：'、'送检医院：'、'检测机构：'标签后的值
    3. 文档中的医院全称或简称
    注意：检测公司名（如'燃石医学'、'吉因加'）不是医院名称。
    如果OCR文本中没有医院名称，查看图片页眉区域。`,
  keywords: ["医院名称", "医院", "hospitalName", "送检单位", "送检医院", "检测机构"],
  fieldKeys: ["hospitalName"]
}
```

### T2: 删除 extractionCore.ts 癌种硬编码规则

**文件**: `packages/core/src/engine/extractionCore.ts`

在 `FIELD_EXTRACTION_RULES` 常量中，删除 C 部分（癌种标准化规则），保留 A 和 B 部分。

具体来说，找到这段代码并删除：
```
  "C. tumorType（癌种/肿瘤类型）标准化规则：",
  "   - 尿路上皮癌（送检部位为膀胱）→ '膀胱癌'",
  "   - 肾细胞癌 → '肾癌'（标准名称）",
  "   - 胃肠道间质瘤 → '胃肠道间质瘤'（4字'胃肠道'，不要简写为'胃肠间质瘤'）",
  "   - 胃的腺癌 → '胃腺癌'（不要简写为'胃癌'）",
  "   - 食管鳞状细胞癌 → '食管癌'（不要细化亚型）",
  "   - 弥漫性胶质瘤 → '胶质瘤'",
  "   - 横纹肌肉瘤 → '横纹肌肉瘤'（不是'癌'，是肉瘤）",
  "   - 非霍奇金淋巴瘤/DLBCL → '非霍奇金淋巴瘤'",
  "   - （距肛缘XXcm处）腺癌 → '肛缘肠癌'（部位推断：距肛缘=肛缘区域）",
```

保留 A 部分（patientName）和 B 部分（hospitalName）不变。

### T3: 删除 evaluate.py 特异性匹配逻辑

**文件**: `scripts/evaluate.py`

找到 `fuzzy_match` 函数，删除其中的医学术语特异性匹配逻辑。

当前的 `fuzzy_match` 函数包含：
1. __ANY__ 检查 → 保留
2. null 检查 → 保留
3. 精确匹配 → 保留
4. 子串匹配（`exp in act or act in exp`）→ 保留（这是通用逻辑）
5. 器官部位匹配（extract_site 函数）→ 删除
6. 淋巴瘤特殊处理 → 删除

修改后的 `fuzzy_match` 应该是：
```python
def fuzzy_match(expected: Any, actual: Any) -> bool:
    """通用匹配：不做任何领域特异性处理。"""
    exp = normalize_value(expected)
    act = normalize_value(actual)
    
    if exp == "__ANY__":
        return act is not None
    
    if exp is None and act is None:
        return True
    if exp is None or act is None:
        return False
    if exp == act:
        return True
    # 通用子串匹配（不是特异性逻辑）
    if isinstance(exp, str) and isinstance(act, str):
        if exp in act or act in exp:
            return True
    return False
```

### T4: 重建 API + 重启服务

```bash
cd /tmp/Medical-Record-Agent
pnpm --filter @medical-record-agent/api build
cd /tmp/Medical-Record-Agent/apps/api
# 停止旧进程
kill $(lsof -t -i:3000) 2>/dev/null || true
sleep 2
# 重启
nohup node dist/index.js > /tmp/mra-api.log 2>&1 &
sleep 3
# 验证启动
curl -s http://127.0.0.1:3000/health || echo "API启动失败"
```

### T5: 癌种定向测试验证

```bash
cd /tmp/Medical-Record-Agent
python3 scripts/evaluate.py --filter-category "癌种识别" --concurrency 2
```

验收标准：
- 字段召回率 ≥ 73.3%
- 字段精确率 ≥ 95%
- 字段F1 ≥ 84.6%

## 完成后

生成审计报告（AUDIT-PHASE1.md），包含：
1. 修改的文件列表
2. 每项改动的具体内容
3. 知识库新增的条目数量
4. 测试结果（指标对比）
5. 是否有遗漏
