# Phase 2 审计报告

> 生成时间：2026-06-14

## 任务完成状态

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 1 | 识别统计聚合 API（后端） | ✅ | `GET /api/stats/fields?schemaKey=xxx` 已实现并测试 |
| 2 | Schema 字段卡片编辑器（前端） | ✅ | SchemaPage 从 Table 改为按分组卡片流布局，支持 inline 编辑、关联知识、识别统计 |
| 3 | JobDetailPage 动态化 | ✅ | 移除所有硬编码常量，从 Schema definition 动态生成字段分组、标签、检测项 |
| 4 | CheckboxMatrix 高亮优化 | ✅ | gap 8→12px，选中项 scale(1.02) 动画，未选中项 ☐ 图标 |

## 修改的文件列表

### 后端新增
| 文件 | 说明 |
|------|------|
| `apps/api/src/services/stats.service.ts` | 识别统计聚合服务（从 RecognitionResult + FeedbackSubmission 聚合） |
| `apps/api/src/services/stats.service.test.ts` | Stats 服务单元测试（4 个用例） |
| `apps/api/src/routes/stats.routes.ts` | Stats API 路由注册 |

### 后端修改
| 文件 | 说明 |
|------|------|
| `apps/api/src/server.ts` | 新增 `statsService` 到 `ApiServerServices` 接口，注册 stats 路由 |
| `apps/api/src/bootstrap/production-services.ts` | 创建并注入 statsService 实例 |

### 前端新增
| 文件 | 说明 |
|------|------|
| `medical-ui/src/components/FieldCard.tsx` | 字段卡片编辑器组件（inline 编辑 + 知识关联 + 识别统计） |
| `medical-ui/src/hooks/useFieldStats.ts` | 字段统计数据 hook |
| `medical-ui/src/hooks/useKnowledge.ts` | Knowledge CRUD hooks（list/create/update/delete） |
| `medical-ui/src/utils/schemaGroups.ts` | Schema 字段分组工具函数 |

### 前端修改
| 文件 | 说明 |
|------|------|
| `medical-ui/src/pages/SchemaPage.tsx` | 重写为卡片流布局（保留左侧 Schema 列表） |
| `medical-ui/src/pages/JobDetailPage.tsx` | 移除 FIELD_GROUPS/FIELD_LABELS/TEST_ITEMS 硬编码，动态化 |
| `medical-ui/src/components/CheckboxMatrix.tsx` | gap 12px、scale(1.02) 动画、☐ 图标 |
| `medical-ui/src/api/client.ts` | 新增 `statsApi.getFieldStats`、`knowledgeApi` CRUD 方法 |
| `medical-ui/src/api/types.ts` | 新增 `FieldStatItem`、`KnowledgeEntry` 类型 |

## 新增的 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/stats/fields?schemaKey={key}&limit={n}` | 字段识别统计聚合 |

**响应格式：**
```json
{
  "stats": [
    {
      "fieldKey": "patientName",
      "recognitionCount": 10,
      "avgConfidence": 0.85,
      "reviewCount": 2,
      "correctionCount": 1,
      "commonErrors": [
        { "original": "张三丰", "corrected": "张三", "count": 1 }
      ]
    }
  ],
  "total": 1
}
```

## 新增的组件列表

| 组件 | 说明 |
|------|------|
| `FieldCard` | Schema 字段卡片编辑器，包含属性 inline 编辑、关联知识管理、识别统计展示 |

## 新增的工具函数

| 函数 | 说明 |
|------|------|
| `groupSchemaFields()` | 按业务归属将 Schema fields 分组 |
| `buildFieldLabels()` | 从 Schema fields 构建 key→label 映射 |
| `extractEnumOptions()` | 从 Schema fields 提取枚举选项 |
| `getTestItemFieldKeys()` | 获取检测项目相关字段 keys |

## 构建验证结果

| 验证项 | 结果 | 说明 |
|--------|------|------|
| `pnpm typecheck` | ✅ 通过 | 所有 workspace（shared/core/api）类型检查通过 |
| `cd medical-ui && pnpm build` | ✅ 通过 | tsc + vite build 成功 |
| Stats 服务测试 | ✅ 4/4 通过 | 识别统计聚合逻辑验证 |
| Server 测试 | ✅ 16/16 通过 | 现有路由测试无回归 |

## 遗留问题

1. **SchemaPage 保存机制**：当前字段编辑仅更新本地 state，未集成 Schema draft 创建 → 验证 → 发布流程。需要后续接入 `schemasApi.createDraft` + `schemasApi.publishDraft`。
2. **检测项提取**：`extractOptionsFromComments` 基于正则从 comments 提取选项，对于格式不规范的 comments 可能提取不完整。建议后续在 Schema definition 中增加 `enumOptions` 字段。
3. **api-services.test.ts 预存失败**：storage key 命名的 11 个测试失败是 Phase 2 之前已存在的问题，与本次变更无关。
