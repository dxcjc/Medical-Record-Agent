# 架构对比图

## V1 架构（旧版）

```
┌─────────────────────────────────────────────────────────────────┐
│                          Linear Pipeline                         │
└─────────────────────────────────────────────────────────────────┘

START → preprocess → ocr → rag(空) → extraction(含RAG+多轮)
                                           ↓
                                    visualReview
                                    (直接修改extraction)
                                           ↓
                                    validation
                                           ↓
                                    autoDecision
                                           ↓
                                    writeback
                                           ↓
                                    evaluation
                                           ↓
                                         END

问题:
❌ RAG 隐藏在 Agent 内部，不可观测
❌ Visual 结果覆盖原始 Extraction
❌ 多轮抽取在 Agent 内循环
❌ 无法根据中间结果调整路径
❌ 无反馈循环机制
```

---

## V2 架构（新版）

```
┌─────────────────────────────────────────────────────────────────┐
│              Intelligent Agent Collaboration System              │
└─────────────────────────────────────────────────────────────────┘

                         START
                           ↓
                    ┌──────────────┐
                    │  Supervisor  │ ← 策略决策者
                    │    Agent     │   (动态路径规划)
                    └──────┬───────┘
                           ↓
                    ┌──────────┐
                    │   OCR    │
                    └─────┬────┘
                          ↓
                    ┌──────────┐
                    │   RAG    │ ← 独立节点
                    │  (独立)  │   (可观测)
                    └─────┬────┘
                          ↓
                    ┌──────────┐
                    │Extraction│ ← 纯粹抽取
                    └─────┬────┘
                          ↓
                    ┌──────────┐
                    │  Visual  │ ← 视觉评审
                    │  Review  │   (不修改原始结果)
                    └─────┬────┘
                          ↓
            ┌─────────────────────────────┐
            │   Conflict Resolution       │ ← 新增
            │   (智能冲突解决)            │
            └──────────┬──────────────────┘
                       ↓
                 ┌──────────┐
                 │Validation│
                 └─────┬────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
    (缺失字段)    (冲突需重试)  (通过)
          │            │            │
          └────────────┴────────────┘
                       ↓
              ┌────────────────┐
              │ 条件边: 重试?  │ ← 反馈循环
              └────────┬───────┘
                       │
              ┌────────┴────────┐
              │                 │
        重新抽取 ←─┘           继续
          (最多N轮)               ↓
                          ┌──────────────┐
                          │ AutoDecision │
                          └──────┬───────┘
                                 ↓
                          ┌──────────┐
                          │Writeback │
                          └─────┬────┘
                                ↓
                          ┌──────────┐
                          │Evaluation│ (异步)
                          └─────┬────┘
                                ↓
                              END

改进:
✅ Supervisor 动态决策执行策略
✅ RAG 独立可观测
✅ 状态完全隔离 (extraction / visualReview / merged)
✅ 智能冲突解决
✅ 支持反馈循环 (最多 N 轮重试)
✅ 条件边实现智能路由
```

---

## 核心改进对比表

| 维度 | V1 (旧版) | V2 (新版) |
|-----|----------|----------|
| **架构模式** | 线性流水线 | 智能协作系统 |
| **动态路径** | ❌ 固定顺序 | ✅ Supervisor 动态决策 |
| **RAG 集成** | ❌ Agent 内部耦合 | ✅ 独立节点可观测 |
| **状态管理** | ❌ Visual 覆盖 Extraction | ✅ 完全隔离存储 |
| **冲突处理** | ❌ 简单覆盖 | ✅ 智能解决 + 人工复核标记 |
| **反馈循环** | ❌ 无 | ✅ Validation → Extraction |
| **多轮抽取** | ❌ Agent 内部循环 | ✅ Workflow 层条件边 |
| **可观测性** | ⚠️ 部分 | ✅ 全流程可追溯 |
| **可扩展性** | ⚠️ 需修改 Agent | ✅ 新增节点即可 |
| **Agent 协作** | ❌ 无协作 | ✅ 冲突解决机制 |

---

## Agent 能力对比

### V1 Agents (5个)

1. **ExtractionAgent** - 抽取 + RAG + 多轮（职责过重）
2. **ValidationAgent** - 验证
3. **WritebackAgent** - 写回检查
4. **EvaluationAgent** - 评估样本生成
5. **VisualReviewAgent** - 视觉评审

### V2 Agents (7个)

1. **SupervisorAgent** - 🆕 策略决策
2. **ExtractionAgent** - 纯粹抽取（职责单一）
3. **VisualReviewAgent** - 视觉评审
4. **ConflictResolutionAgent** - 🆕 冲突解决
5. **ValidationAgent** - 验证
6. **WritebackAgent** - 写回检查
7. **EvaluationAgent** - 评估样本生成

**新增能力**:
- ✅ 策略决策（Supervisor）
- ✅ 冲突检测与智能解决
- ✅ Agent 职责更单一、更清晰

---

## 执行流程示例

### 场景：表格类病历识别

#### V1 流程
```
1. OCR → 识别文字
2. Extraction (内部执行 RAG) → 抽取字段
3. Visual Review → 覆盖部分字段
4. Validation → 发现缺失 → 标记 needs_review (停止)
```
**结果**: 人工介入

#### V2 流程
```
1. Supervisor → 决策使用 "visual-priority" 策略
2. OCR → 识别文字
3. RAG → 检索到 3 条表格识别知识
4. Extraction → 抽取字段 (使用 RAG 上下文)
5. Visual Review → 补充识别勾选框
6. Conflict Resolution → 检测到 2 个冲突
   - patientGender: extraction="男"(0.6) vs visual="女"(0.9)
   - 决策: 使用 visual 结果 (置信度更高)
7. Validation → 发现缺失必填字段 "hospitalName"
8. 条件边 → 触发重新抽取 (针对 "hospitalName")
9. Extraction (第2轮) → 补充 "hospitalName"
10. Validation → 全部通过 ✅
11. Writeback → 自动写回
```
**结果**: 自动完成，无需人工

---

## 总结

**V2 架构核心价值**:
1. 🎯 **更智能** - Supervisor 动态决策最优路径
2. 🔍 **更透明** - 每个节点的决策过程可追溯
3. 🔄 **更灵活** - 支持反馈循环和智能重试
4. 🤝 **更协作** - Agent 之间可通过冲突解决机制协作
5. 📈 **更可靠** - 自动解决冲突，降低人工介入率

**适用场景**:
- ✅ 复杂医疗文档识别（表格、手写、勾选框）
- ✅ 需要高准确率的关键字段抽取
- ✅ 多数据源融合场景（OCR + Visual + Knowledge）
- ✅ 需要可解释性的 AI 系统
