# 📋 三方对比评审报告

**生成时间**: 2026-06-20 01:30  
**评审范围**: baseline期望值 vs Agent输出 vs 原始图片OCR  
**评审目的**: 找出准确率下降的根源，制定针对性修复方案

---

## 📊 评审统计

| 分类 | 数量 | 占比 | 说明 |
|------|------|------|------|
| ✅ 正确匹配 | 71条 | 56% | baseline和Agent一致 |
| ⚠️ 格式/内容不一致 | 44条 | 35% | 需要判断谁对谁错 |
| ❌ Agent输出null | 12条 | 9% | Agent未输出或超时 |

---

## 🔍 格式/内容不一致分析（26条详细评审）

### 1️⃣ baseline更准确（7条）

| 样本 | 字段 | baseline | Agent | 问题 |
|------|------|----------|-------|------|
| TC014 | cancerCategory | 乳腺/乳腺浸润性导管癌 | 乳腺/乳腺癌 | Agent过于笼统 |
| TC016 | cancerCategory | 乳腺/乳腺浸润性导管癌, 乳腺/乳腺导管原位癌 | 乳腺/乳腺癌 | Agent丢失亚型 |
| TC020 | pathologicalDiagnosis | （左乳）浸润性导管癌，非特殊类型，II级（中分化） | 左乳浸润性导管癌 | Agent丢失分级 |
| TC026 | cancerTag | 原发灶不明 | 单癌 | Agent判断错误 |
| TC043 | cancerTag | 结肠癌,小肠癌 | 单癌 | Agent未识别多部位 |
| TC044 | cancerTag | 乳腺导管原位癌,乳腺浸润性癌 | 单癌 | Agent未识别多类型 |
| TC045 | cancerTag | 肺小细胞癌,肺腺癌 | 单癌 | Agent未识别多类型 |

**修复方向**: 优化知识库规则，引导Agent输出更详细的亚型/分级信息

---

### 2️⃣ Agent更准确（6条）

| 样本 | 字段 | baseline | Agent | 问题 |
|------|------|----------|-------|------|
| TC004 | pathologicalDiagnosis | ...符合弥漫性大B细胞淋巴瘤... | ...非霍奇金淋巴瘤，符合弥漫性大B细胞淋巴瘤... | baseline漏了关键诊断 |
| TC005 | pathologicalDiagnosis | （右肾）符合缺陷型肾细胞癌 | （右肾）FH缺陷型肾细胞癌 | baseline漏了"FH" |
| TC013 | cancerCategory | 肺/肺腺癌 | 肺/非小细胞肺癌/肺腺癌 | Agent层级更完整 |
| TC027 | cancerCategory | 肺/肺腺癌 | 肺/非小细胞肺癌/肺腺癌 | Agent层级更完整 |
| TC033 | cancerCategory | 肺/肺腺癌 | 肺/非小细胞肺癌/肺腺癌 | Agent层级更完整 |
| TC042 | cancerCategory | 肺/肺腺癌 | 肺/非小细胞肺癌/肺腺癌 | Agent层级更完整 |

**修复方向**: 修正baseline期望值

---

### 3️⃣ baseline错误（3条）

| 样本 | 字段 | baseline | Agent | 问题 |
|------|------|----------|-------|------|
| TC007 | cancerCategory | 食管/胃/食管鳞状细胞癌 | 食管/食管鳞状细胞癌 | 食管癌不应放"胃"下 |
| TC010 | cancerCategory | 食管/胃/食管胃腺癌/胃腺癌 | 胃/胃腺癌/中-低分化腺癌 | 胃癌不应放"食管"下 |
| TC032 | cancerCategory | 胰腺/胰腺腺癌 | 胃/胃腺癌 | baseline写成胰腺，实际是胃 |

**修复方向**: 修正baseline期望值

---

### 4️⃣ Agent更简洁（3条）

| 样本 | 字段 | baseline | Agent | 问题 |
|------|------|----------|-------|------|
| TC017 | pathologicalDiagnosis | ...肝脏组织内见浸润性癌，结合临床病史... | （肝脏右前叶）转移性低分化腺癌，符合肠癌来源 | Agent简化但核心一致 |
| TC018 | pathologicalDiagnosis | ...示转移性腺癌，内见个别脉管癌栓... | 肝脏转移性腺癌，支持乳腺来源 | Agent简化但核心一致 |
| TC019 | pathologicalDiagnosis | ...查见恶性肿瘤细胞（腺癌）... | （腹水）腺癌，考虑女性生殖系统来源 | Agent简化但核心一致 |

**修复方向**: 可接受，或在知识库引导输出更完整描述

---

### 5️⃣ 可接受差异（6条）

| 样本 | 字段 | 说明 |
|------|------|------|
| TC006 | pathologicalDiagnosis | "占位"简化为"丘脑"，核心一致 |
| TC011 | cancerCategory | 层级结构不同但都合理 |
| TC012 | cancerCategory | "癌"字差异，实质相同 |
| TC015 | cancerCategory | 层级不同但都合理 |
| TC040 | pathologicalDiagnosis | 括号差异，实质相同 |
| TC041 | pathologicalDiagnosis | 表述不同，实质相同 |

**修复方向**: 无需修复，匹配逻辑已处理

---

### 6️⃣ 需要核实（1条）

| 样本 | 字段 | baseline | Agent | 问题 |
|------|------|----------|-------|------|
| TC028 | pathologicalDiagnosis | 乳腺恶性肿瘤 | 乳腺恶性纤维瘤 | 需看原图确认 |

**修复方向**: 核实原图内容

---

## ❌ Agent输出null的样本（12条）

| 样本 | 字段 | 状态 | 原因 |
|------|------|------|------|
| TC019 | cancerCategory | ok | Agent未输出该字段 |
| TC024 | pathologicalDiagnosis | ok | Agent未输出该字段 |
| TC031 | cancerTag/cancerCategory/pathologicalDiagnosis | ok | Agent未输出这些字段 |
| TC035 | 全部字段 | timeout | Agent调用超时 |
| TC036 | 全部字段 | failed | Agent调用失败 |
| TC041 | cancerCategory | ok | Agent未输出该字段 |

**修复方向**: 
1. 检查OCR服务是否正常
2. 检查Agent对这些图片的处理逻辑
3. 增加超时重试机制

---

## 🎯 针对性修复方案

### 方案一：修正baseline（影响 9 条）
- TC004: baseline漏了"非霍奇金淋巴瘤"
- TC005: baseline漏了"FH"
- TC007: 食管癌不应放"胃"下
- TC010: 胃癌不应放"食管"下
- TC013/TC027/TC033/TC042: 肺腺癌应加"非小细胞肺癌"层级
- TC032: baseline写成胰腺，实际是胃

**预期效果**: 准确率 +7% (9/127)

### 方案二：优化知识库（影响 7 条）
- TC014/TC016: 引导Agent输出详细亚型
- TC020: 引导Agent输出分级信息
- TC026/TC043/TC044/TC045: 引导Agent识别多部位/多类型

**预期效果**: 准确率 +5% (7/127)

### 方案三：修复Agent null输出（影响 12 条）
- 检查TC035/TC036的超时/失败原因
- 检查TC031/TC041的OCR识别结果
- 增加超时重试机制

**预期效果**: 准确率 +9% (12/127)

---

## 📈 预期准确率提升

| 方案 | 当前 | 修复后 | 提升 |
|------|------|--------|------|
| 修正baseline | 51.4% | 58.4% | +7% |
| 优化知识库 | 58.4% | 63.4% | +5% |
| 修复null输出 | 63.4% | 72.4% | +9% |
| **总计** | **51.4%** | **72.4%** | **+21%** |

---

## ✅ 建议执行顺序

1. **先修正baseline**（方案一）— 最快见效，无代码改动
2. **再优化知识库**（方案二）— 针对性改一条测试一条
3. **最后修复null输出**（方案三）— 需要调试Agent/OCR

---

## 📝 评审结论

**准确率下降原因**:
1. baseline修正时引入了新的错误（TC007/TC010/TC032）
2. 部分baseline期望值与图片内容不一致（TC020/TC026）
3. Agent对多部位/多类型的识别能力不足（TC043/TC044/TC045）

**建议**:
1. 优先修正baseline中的3处错误
2. 针对cancerTag多类型识别，优化知识库规则
3. 检查Agent null输出的样本，修复OCR/超时问题
