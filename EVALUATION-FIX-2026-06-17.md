# 评测中心问题修复报告 - 2026-06-17

## 问题现象

用户反馈：**评测运行完成但结果为空**
- Provider 列显示"未指定"
- 总体指标为 0
- 字段级指标为空

---

## 根因分析

### 问题 1：Provider 显示"未指定" ✅ 已修复

**根因**：前后端数据结构不匹配

- **数据库**：`EvaluationRun` 表只有 `providerConfig` 字段（JSON 类型）
- **前端期望**：`record.providerKey` 直接获取字符串
- **实际存储**：`providerConfig = {"providerKey": "xxx"}`

**修复方案**：
```typescript
// medical-ui/src/pages/EvaluationPage.tsx:1395-1405
{
  title: 'Provider',
  width: 150,
  render: (_: unknown, record: EvaluationRun) => {
    // 从 providerConfig JSON 中提取 providerKey
    const config = record.providerConfig as Record<string, unknown> | undefined;
    const key = config?.providerKey as string | undefined;
    if (!key) return <span style={{ color: '#999' }}>未指定</span>;
    return providerNameMap[key] || key;
  },
}
```

**类型定义修复**：
```typescript
// medical-ui/src/api/types.ts:281
export interface EvaluationRun {
  // ...
  providerConfig?: Record<string, unknown>;  // 改为 providerConfig
  // providerKey: string;  // 删除错误的字段
}
```

---

### 问题 2：评测结果为空的根本原因 ⚠️

**可能原因**（按优先级排序）：

1. **数据集没有样本** (最可能)
   - 用户创建了数据集但忘记导入样本
   - 评测会"成功完成"但因为没有样本所以指标为 0

2. **Provider 未启用或配置错误**
   - Provider 状态为 inactive
   - Provider 配置（endpoint、API key）错误
   - 识别任务全部失败

3. **Ground Truth 格式不正确**
   - 字段名与 Schema 不匹配
   - 数据类型错误

---

## 修复内容

### 1. Provider 显示修复 ✅

**文件**：`medical-ui/src/pages/EvaluationPage.tsx`

- 从 `providerConfig` JSON 中提取 `providerKey`
- 更新类型定义 `EvaluationRun.providerConfig`

### 2. 创建评测前的数据校验 ✅

**文件**：`medical-ui/src/pages/EvaluationPage.tsx:1036-1107`

#### 2.1 数据集样本数量显示

```typescript
<Select placeholder="选择评测数据集">
  {datasets.map(d => (
    <Option key={d.id} value={d.id}>
      {d.displayName || d.key}
      {d._count?.samples !== undefined && (
        <Text type="secondary">
          ({d._count.samples} 个样本)
        </Text>
      )}
      {d._count?.samples === 0 && (
        <Tag color="red" size="small">无样本</Tag>
      )}
    </Option>
  ))}
</Select>
```

#### 2.2 Provider 状态显示

```typescript
<Select placeholder="选择 Provider">
  {providers.map(p => (
    <Option key={p.key} value={p.key} disabled={p.status !== 'active'}>
      {p.displayName || p.key}
      {p.status !== 'active' && (
        <Tag color="gray" size="small">已禁用</Tag>
      )}
    </Option>
  ))}
</Select>
{providers.length === 0 && (
  <Text type="warning">
    没有可用的 Provider，请先在 Provider 管理页面配置
  </Text>
)}
```

#### 2.3 提交前验证

```typescript
const handleSubmit = async () => {
  const values = await form.validate();

  // 验证数据集是否有样本
  const selectedDataset = datasets.find(d => d.id === values.datasetId);
  const sampleCount = selectedDataset._count?.samples || 0;
  if (sampleCount === 0) {
    toast.error('该数据集没有样本，无法创建评测。请先导入样本数据。');
    return;
  }

  // 验证 Provider 是否可用
  const selectedProvider = providers.find(p => p.key === values.providerKey);
  if (selectedProvider.status !== 'active') {
    toast.warning(`Provider "${selectedProvider.displayName}" 未启用，评测可能失败`);
  }

  // 创建评测
  await mutation.mutateAsync({ ... });
};
```

---

## 用户操作指南

### 创建有效的评测

1. **创建数据集**
   ```
   评测中心 → 数据集 Tab → 创建数据集
   - 设置 Key、名称
   - 勾选"已脱敏"（必须）
   ```

2. **导入样本**
   ```
   数据集详情 → 导入样本
   - 每个样本必须包含 groundTruth
   - 字段名必须与 Schema 一致
   ```

   示例 JSON：
   ```json
   {
     "samples": [
       {
         "externalId": "sample-001",
         "groundTruth": {
           "patientName": "张三",
           "age": "45",
           "gender": "male"
         },
         "metadata": {
           "sourceType": "file",
           "fileId": "file-xxx"
         }
       }
     ]
   }
   ```

3. **配置 Provider**
   ```
   Provider 管理 → 创建 Provider
   - 选择类型：LLM 或 OCR
   - 启用状态：必须为"启用"
   - 设为默认（可选）
   ```

4. **创建评测运行**
   ```
   评测中心 → 运行 Tab → 创建评测运行
   - 选择数据集（显示样本数量）
   - 选择 Provider（自动过滤禁用的）
   - 设置样本限制（可选）
   ```

---

## 诊断工具

如果评测仍然无结果，使用以下 SQL 查询诊断：

```sql
-- 1. 检查数据集样本数
SELECT
  d.id,
  d."displayName",
  COUNT(s.id) as sample_count
FROM "EvaluationDataset" d
LEFT JOIN "EvaluationSample" s ON s."datasetId" = d.id
GROUP BY d.id, d."displayName"
ORDER BY d."createdAt" DESC
LIMIT 10;

-- 2. 检查评测运行状态
SELECT
  r.id,
  r.status,
  r."providerConfig",
  r.summary,
  r.error,
  COUNT(m.id) as metric_count
FROM "EvaluationRun" r
LEFT JOIN "EvaluationMetric" m ON m."runId" = r.id
WHERE r.id = '<评测运行ID>'
GROUP BY r.id;

-- 3. 检查识别任务
SELECT
  j.id,
  j.status,
  j.options->>'evaluationRunId' as eval_run_id
FROM "RecognitionJob" j
WHERE j.options->>'evaluationRunId' = '<评测运行ID>'
ORDER BY j."createdAt" DESC;
```

---

## 验证结果

### 构建测试
```bash
$ npm run build
✓ 2689 modules transformed
✓ built in 14.14s
```

### 修改文件
```
medical-ui/src/api/types.ts           |  1 line (providerConfig)
medical-ui/src/pages/EvaluationPage.tsx | 45 lines (显示+校验)
EVALUATION-DEBUG-GUIDE.md             | 新增诊断指南
```

---

## 后续建议

### 1. 后端优化

在 API 返回的评测运行列表中，直接提取 `providerKey`：

```typescript
// apps/api/src/services/api-services.ts
async listRuns(input) {
  const runs = await repository.listRuns();
  return runs.map(r => ({
    ...r,
    providerKey: r.providerConfig?.providerKey || null  // 展平
  }));
}
```

### 2. 前端增强

#### 2.1 空状态优化

```typescript
{run.status === 'completed' && metrics.length === 0 && (
  <Alert type="warning" title="评测完成但无结果">
    <div>可能原因：</div>
    <ul>
      <li>数据集没有样本 → 检查数据集配置</li>
      <li>识别任务失败 → 检查 Provider 状态</li>
      <li>Ground Truth 格式错误 → 验证字段名称</li>
    </ul>
    <Button onClick={() => navigate('/docs/evaluation-debug')}>
      查看诊断指南
    </Button>
  </Alert>
)}
```

#### 2.2 实时进度显示

```typescript
{run.status === 'running' && (
  <Progress
    percent={(run.processedSamples / run.totalSamples) * 100}
    status="active"
  />
)}
```

---

## 总结

✅ **已修复**：
1. Provider 显示"未指定" → 现在正确显示 Provider 名称
2. 创建评测无校验 → 现在会提前检查样本数量和 Provider 状态

⚠️ **用户操作建议**：
1. 确保数据集有样本后再创建评测
2. 确保 Provider 已启用且配置正确
3. Ground Truth 字段名必须与 Schema 一致

📚 **文档**：
- `EVALUATION-DEBUG-GUIDE.md` - 完整的诊断指南
- 包含 SQL 查询、常见问题和修复方案
