# 评测中心调试指南

## 问题现象

评测运行完成，但结果为空：
- 总体指标显示 0
- 字段级指标为空（"暂无字段级指标"）
- 状态显示"已完成"而非"失败"

---

## 根因分析

从代码分析来看，评测流程是完整的：

1. ✅ **API 层**：`POST /evaluations/runs` → `evaluationService.createRun()`
2. ✅ **Service 层**：`createRun()` → 调用 `evaluationRunner.run()`
3. ✅ **Runner 层**：`runEvaluation()` → 为每个样本创建识别任务
4. ✅ **指标计算**：`persistEvaluationMetrics()` → 保存到数据库

**但是**，如果以下任一条件不满足，就会得到空结果：

### 可能原因 1：数据集没有样本

```typescript
// apps/api/src/bootstrap/production-services.ts:2475
const samples = await repositories.evaluationRepository.listSamples(
  input.datasetId,
  input.sampleLimit
);
```

如果 `samples` 是空数组，评测会"成功完成"但没有任何结果。

### 可能原因 2：识别任务全部失败

```typescript
// 第 2489 行：为每个样本执行识别
const result = await input.recognitionOrchestrator.start({
  jobId: job.id,
  schemaKey: schemaResolution.schemaKey,
  document: toEvaluationDocumentInput(sample)
});
```

如果识别编排器返回失败，metrics 就会是空的。

### 可能原因 3：Ground Truth 格式不正确

评测需要对比 `prediction` 和 `ground truth`：
- 如果 ground truth 为空或格式错误
- 无法计算准确率等指标

---

## 诊断步骤

### 1. 检查数据集样本

```sql
-- 查询数据集是否有样本
SELECT
  d.id,
  d."displayName",
  COUNT(s.id) as sample_count
FROM "EvaluationDataset" d
LEFT JOIN "EvaluationSample" s ON s."datasetId" = d.id
GROUP BY d.id, d."displayName"
ORDER BY d."createdAt" DESC
LIMIT 10;
```

**预期结果**：至少有 1 个样本

### 2. 检查样本数据质量

```sql
-- 查看具体样本内容
SELECT
  id,
  "externalId",
  "groundTruth",
  "metadata"
FROM "EvaluationSample"
WHERE "datasetId" = '<你的数据集ID>'
LIMIT 5;
```

**检查点**：
- `groundTruth` 不应为空或 `{}`
- 应该包含字段和值，如 `{"patientName": "张三", "age": "45"}`

### 3. 检查评测运行状态

```sql
-- 查看评测运行详情
SELECT
  r.id,
  r.status,
  r."startedAt",
  r."completedAt",
  r.summary,
  r.error,
  COUNT(m.id) as metric_count
FROM "EvaluationRun" r
LEFT JOIN "EvaluationMetric" m ON m."runId" = r.id
WHERE r.id = '<你的运行ID>'
GROUP BY r.id;
```

**检查点**：
- `status` = 'completed'
- `error` 应该为 null
- `metric_count` 应该 > 0（有指标数据）
- 查看 `summary` 字段是否有详细信息

### 4. 检查关联的识别任务

```sql
-- 查找评测创建的识别任务
SELECT
  j.id,
  j.status,
  j."schemaKey",
  j.options->>'evaluationRunId' as eval_run_id,
  j.options->>'evaluationSampleId' as eval_sample_id
FROM "RecognitionJob" j
WHERE j.options->>'evaluationRunId' = '<你的运行ID>'
ORDER BY j."createdAt" DESC
LIMIT 20;
```

**检查点**：
- 应该有识别任务被创建
- 任务状态应该是 'completed' 而非 'failed'

### 5. 检查识别结果

```sql
-- 查看识别任务的结果
SELECT
  r."jobId",
  r.fields,
  r."normalizedFields",
  r."reviewRequired"
FROM "RecognitionResult" r
INNER JOIN "RecognitionJob" j ON j.id = r."jobId"
WHERE j.options->>'evaluationRunId' = '<你的运行ID>'
LIMIT 5;
```

**检查点**：
- `fields` 和 `normalizedFields` 应该有识别出的字段值

---

## 修复方案

### 方案 1：数据集没有样本

**问题**：创建数据集后忘记导入样本

**修复**：
1. 使用 `POST /evaluations/datasets/:id/samples` 导入样本
2. 确保每个样本有正确的 `groundTruth`

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

### 方案 2：识别任务失败

**问题**：Provider 配置错误、Schema 不匹配、文件缺失

**修复**：
1. 检查 Provider 是否在线：`GET /providers/health`
2. 确认 Schema 版本存在且已启用
3. 如果样本引用了 `fileId`，确保文件存在

### 方案 3：Ground Truth 格式问题

**问题**：字段名不匹配、数据类型错误

**修复**：
- Ground Truth 的字段名必须与 Schema 定义一致
- 确保值的类型正确（字符串、数字、布尔值）

```json
// ❌ 错误
{
  "patient_name": "张三"  // 字段名不匹配
}

// ✅ 正确
{
  "patientName": "张三"  // 与 Schema 一致
}
```

---

## 前端改进建议

### 1. 运行中状态优化

```tsx
// EvaluationPage.tsx - 详情 Modal
{run.status === 'running' ? (
  <EmptyState
    icon={<IconLoading />}
    title="评测正在进行中"
    description={`正在处理 ${run.summary?.processedSamples || 0}/${run.summary?.totalSamples || 0} 个样本`}
    action={{
      label: "返回列表",
      onClick: () => navigate('/evaluation')
    }}
  />
) : run.status === 'completed' && metrics.length === 0 ? (
  <EmptyState
    icon={<IconAlert />}
    title="评测完成但无结果"
    description="可能原因：数据集无样本、识别失败或 Ground Truth 格式错误"
    action={{
      label: "查看诊断指南",
      onClick: () => window.open('/docs/evaluation-debug', '_blank')
    }}
  />
) : (
  // 显示正常结果
)}
```

### 2. 创建评测前的校验

```tsx
// 在 createRun 之前验证
const dataset = await evaluationApi.getDataset(datasetId);
if (dataset.sampleCount === 0) {
  toast.error('数据集无样本，请先导入评测样本');
  return;
}

// 提示用户确认
Modal.confirm({
  title: '确认创建评测？',
  content: `将使用 ${dataset.sampleCount} 个样本进行评测，预计耗时 ${estimatedTime}`,
  onOk: () => createRun()
});
```

### 3. 显示详细错误信息

```tsx
// 从 run.error 或 run.summary 提取错误
if (run.status === 'failed') {
  const errorMsg = run.error?.message || '未知错误';
  const errorCode = run.error?.code;

  return (
    <Alert type="error" title="评测失败">
      <div>错误码：{errorCode}</div>
      <div>错误信息：{errorMsg}</div>
      <div>请检查 Provider 配置和 Schema 版本</div>
    </Alert>
  );
}
```

---

## 快速诊断脚本

创建一个 CLI 命令快速诊断评测问题：

```bash
# apps/api/src/cli/diagnose-evaluation.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function diagnoseEvaluationRun(runId: string) {
  console.log(`🔍 诊断评测运行：${runId}\n`);

  // 1. 检查运行基本信息
  const run = await prisma.evaluationRun.findUnique({
    where: { id: runId },
    include: {
      dataset: {
        include: {
          _count: { select: { samples: true } }
        }
      },
      _count: { select: { metrics: true } }
    }
  });

  if (!run) {
    console.error('❌ 评测运行不存在');
    return;
  }

  console.log('✅ 运行状态：', run.status);
  console.log('📊 数据集：', run.dataset.displayName);
  console.log('📝 样本数：', run.dataset._count.samples);
  console.log('📈 指标数：', run._count.metrics);

  // 2. 检查识别任务
  const jobs = await prisma.recognitionJob.findMany({
    where: {
      options: {
        path: ['evaluationRunId'],
        equals: runId
      }
    },
    select: { id: true, status: true }
  });

  const jobStats = jobs.reduce((acc, j) => {
    acc[j.status] = (acc[j.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('\n🔧 识别任务统计：');
  console.log('  总数：', jobs.length);
  Object.entries(jobStats).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });

  // 3. 如果无指标，分析原因
  if (run._count.metrics === 0) {
    console.log('\n⚠️  无指标数据，可能原因：');

    if (run.dataset._count.samples === 0) {
      console.log('  ❌ 数据集无样本');
    }

    if (jobs.length === 0) {
      console.log('  ❌ 未创建识别任务');
    } else if (jobStats.failed === jobs.length) {
      console.log('  ❌ 所有识别任务失败');
    } else if (jobStats.completed && jobStats.completed > 0) {
      console.log('  ⚠️  有识别完成但无指标，可能是 Ground Truth 格式问题');
    }
  }

  await prisma.$disconnect();
}

// 使用：node dist/cli/diagnose-evaluation.js <run-id>
diagnoseEvaluationRun(process.argv[2]);
```

运行方式：
```bash
cd apps/api
npm run build
node dist/cli/diagnose-evaluation.js <你的评测运行ID>
```

---

## 总结

评测结果为空的核心原因：
1. **数据集无样本** → 导入样本后重新评测
2. **识别任务失败** → 检查 Provider 和 Schema 配置
3. **Ground Truth 格式错误** → 确保字段名和类型匹配

建议先运行 SQL 查询确认具体原因，然后针对性修复。
