# kimi-k2.6 接入修复计划

## 背景
将病历识别系统的主模型从 doubao-seed-2.0-pro 切换为 kimi-k2.6（推理模型），以提升复杂病历的理解能力。切换后遇到多个兼容性问题。

## 已完成修复
1. ✅ Provider 配置修正（endpoint、apiKey、独立 provider）
2. ✅ parseJsonObject 增强（支持 markdown code block）
3. ✅ reasoning_effort 参数传递（minimal 关闭深度推理）
4. ✅ max_tokens: 4096 补全
5. ✅ getFirstChoiceContent 回退到 reasoning_content

## 待验证修复
- [ ] 膀胱癌单样本端到端测试（验证 reasoning_content 回退是否生效）
- [ ] 视觉评审 Agent 是否也遇到同样问题
- [ ] 3次重试超时问题（reasoning_effort=minimal 后应大幅改善）

## 架构优化项

### 1. max_tokens 配置化
- **问题**: 硬编码 4096，不同场景可能需要不同值
- **方案**: 从 provider config 的 `maxTokens` 字段读取，默认 4096
- **影响**: httpLlmProvider.ts、providerTypes.ts、production-services.ts

### 2. reasoning_content 统一处理
- **问题**: 只有 httpLlmProvider 处理了，visualReviewAgent 可能用不同路径
- **方案**: 在 getFirstChoiceContent 层面统一处理，所有调用方自动受益
- **影响**: 仅 httpLlmProvider.ts（已完成）

### 3. 视觉评审 Agent 兼容性
- **问题**: visualReviewAgent 调用 LLM 的方式可能与 extraction 不同
- **方案**: 确认 visualReviewAgent 是否走 httpLlmProvider，如果是则自动兼容
- **影响**: 需要检查 visualReviewAgent.ts

### 4. 超时与重试策略
- **问题**: 3次重试 × 60s = 180s，加上 OCR 和视觉评审，总时间可能超过 300s
- **方案**: reasoning_effort=minimal 后响应时间应降至 20s 以内，重试次数可保持
- **影响**: 无需修改，验证后确认

### 5. 日志增强
- **问题**: 模型返回空 content 时难以诊断
- **方案**: 在 getFirstChoiceContent 中增加日志，记录 content/reasoning_content 状态
- **影响**: httpLlmProvider.ts

## 验证计划

### Phase 1: 单样本验证
- 运行 TC001（膀胱癌）端到端测试
- 预期: 30s 内完成，至少 3/5 字段匹配

### Phase 2: 癌种定向测试
- 运行 10 个癌种测试用例
- 预期: 召回率 ≥ 80%，完全正确率 ≥ 50%

### Phase 3: 全量回归
- 运行 45 个样本全量测试
- 预期: F1 ≥ 85%

## 风险评估
- **高**: kimi-k2.6 推理模型行为不稳定，content/reasoning_content 分配可能因 prompt 不同而变化
- **中**: 视觉评审可能需要单独调优
- **低**: max_tokens 配置化是常规改动
