在 /tmp/Medical-Record-Agent 项目中实现 Phase 2 任务。

【必须遵循 Superpowers 流程】
读取 CLAUDE.md 了解核心规则。你必须：
1. 先用 brainstorming skill 做需求分析
2. 按 writing-plans skill 输出实现计划
3. 按 TDD 流程执行（先写测试，再实现）
4. 按 verification-before-completion skill 验证

【重要】不要问问题，不要询问确认。不清楚的点自己合理假设。直接开始工作。

## 任务清单

### 任务 1: Schema 字段卡片编辑器
把 SchemaPage 的字段表格改为卡片流布局。

每个字段一张卡片，包含：
- 字段头：label + key + 必填/关键标签
- 属性区域（直接 inline 编辑，不弹 Modal/Drawer）：标签、类型、LIMS映射、识别说明(textarea)、枚举值(enum类型)、写回模式
- 关联知识区域：显示 fieldKeys 包含该字段 key 的 KnowledgeEntry 列表，支持 inline 增删改
- 识别统计区域：显示该字段的识别次数、置信度均值、需复核次数、常见错误模式

整体布局：
- 左侧栏不变（Schema 列表）
- 右侧改为按字段分组的卡片流（患者信息/送检信息/临床诊断/样本信息/检测项目/其他）
- 分组信息从 Schema definition 的 fields 数组中读取，按业务归属分组

保存机制：
- 字段属性修改 → 更新 Schema definition JSON → 可选发布新版本
- 知识条目修改 → 调 Knowledge API

### 任务 2: 识别统计聚合 API
新增 GET /api/stats/fields?schemaKey=tumor-gene-test&limit=100

从 RecognitionResult + FeedbackSubmission 聚合：
- 每个字段的识别次数、平均置信度、需复核次数、修正次数
- 常见错误模式（从 FeedbackSubmission 的 originalValue/correctedValue 聚合）

### 任务 3: JobDetailPage 动态化
去掉 JobDetailPage 中所有硬编码：
- FIELD_GROUPS → 从 Schema definition 动态生成
- FIELD_LABELS → 从 Schema definition 的 fields[].label 读取
- LUNG_TEST_ITEMS / GI_TEST_ITEMS / OTHER_TEST_ITEMS → 从 Schema definition 的 enumOptions 读取
- CheckboxMatrix 选项 → 从 Schema 动态获取

### 任务 4: CheckboxMatrix 高亮优化
修改 CheckboxMatrix.tsx：
- 选中项：蓝色实底 #3370FF + 白色文字 + ☑ 图标 + 粗体 + 蓝色边框
- 未选中项：灰色浅底 #F7F8FA + 灰色文字 + ☐ 图标 + 正常字重 + 灰色边框
- 选中项加微动画 transform: scale(1.02)
- 间距从 gap: 8px 加大到 12px

## 完成后
1. 运行 pnpm typecheck 验证
2. 运行 cd medical-ui && pnpm build 验证前端构建
3. 将审计报告写入 /tmp/Medical-Record-Agent/PHASE2-AUDIT.md，包含：
   - 每个任务的完成状态（✅/❌）
   - 修改的文件列表
   - 新增的 API 端点
   - 新增的组件列表
   - 遗留问题
   - 构建验证结果
