# Agent 框架对照实验

本文档记录病历识别 Agent 对 LangGraph.js、LangChain.js、OpenAI Agents SDK、Mastra 和 LlamaIndex.TS 的取舍。结论服务于当前项目，不代表通用优劣排序。

## 当前结论

主链路继续使用 LangGraph.js + LangChain.js。

- LangGraph.js 承担 OCR、RAG、抽取、验证、自动决策、写回和评估的状态机编排。
- LangChain.js 承担模型调用层、prompt template、structured output 和轻量 RAG 组合。
- OpenAI Agents SDK 放在隔离实验区，用于学习 tools、handoffs、guardrails、tracing 和 sandbox 形态。
- Mastra 暂作为 TypeScript Agent 框架对照对象，不进入主链路。
- LlamaIndex.TS 暂作为第二阶段完整医学知识库和 RAG 管理候选，不进入第一阶段主链路。

## 为什么 LangGraph 仍是主线

医疗病历识别的关键不是让模型自由对话，而是让每个高风险动作都有确定边界：

- 每个节点输入输出可追踪。
- yellow/red 决策不能自动写回。
- 写回前必须经过权限、幂等和审计。
- 评估样本必须确认脱敏。
- 失败状态需要落库并可重试。

LangGraph 更适合表达这种状态机式工作流。它能把 OCR、抽取、校验、写回和评估拆成显式节点，并在条件分支中固定高风险动作的安全边界。

## OpenAI Agents SDK 实验范围

OpenAI 官方文档把 Agents SDK 定位为适合 code-first orchestration、agents、tools、handoffs、guardrails、tracing 和 sandbox execution 的工具。官方 quickstart 也建议先从一个 focused agent 开始，再逐步增加 tools 和 specialist agents。

本项目的实验实现位于：

- `packages/core/src/experiments/openAiAgentsLab.ts`
- `packages/core/test/openAiAgentsLab.test.ts`

实验只定义两个 specialist：

- `clinical-extraction-specialist`：抽取字段候选。
- `clinical-validation-specialist`：校验证据并输出 green / needs_review / blocked。

实验通过注入 runner 执行，不直接依赖 API key，也不把 `@openai/agents` 作为生产强依赖。真实 SDK 适配层后续可以放在 API 或实验包中实现：

```ts
const runner = async (agentName, input) => {
  // 后续可在这里创建 Agent、tool、handoff 并调用 run(agent, input)。
  // core 层只消费 finalOutput 和 trace，避免实验 SDK 泄露到生产 workflow。
};
```

## 框架对比

| 框架 | 适合本项目的部分 | 当前边界 |
| --- | --- | --- |
| LangGraph.js | 状态机、条件分支、节点级 trace、可控写回 | 主生产编排 |
| LangChain.js | prompt、structured output、retriever、模型适配 | 主模型调用层 |
| OpenAI Agents SDK | tools、handoffs、guardrails、tracing、sandbox 学习 | 实验区，不直接写回 |
| Mastra | TypeScript Agent 应用框架，对工程化 agent 有参考价值 | 先文档对比，不引入依赖 |
| LlamaIndex.TS | 文档索引、知识库、RAG 数据管理 | 第二阶段知识库候选 |

## 晋升条件

OpenAI Agents SDK 只有在满足以下条件后才考虑进入主链路：

- 能把工具权限、guardrails 和写回审批表达得比现有 LangGraph 节点更清晰。
- 能输出足够完整的 trace，用于审计和评估。
- 能在无真实病历泄露风险的环境下运行。
- 能和现有 Schema Registry、Evaluation Runner、Audit Middleware 严格解耦。
- 能通过 synthetic 和真实脱敏样本评估，不降低 green/yellow/red 决策稳定性。

LlamaIndex.TS 只有在轻量 RAG 无法满足医学知识库版本化、证据检索和反馈样本检索时才进入候选实现。

Mastra 只有在项目需要完整 TypeScript Agent 应用框架能力，并且其工程约束优于当前 Fastify + LangGraph 组合时再评估。

## 当前不做的事

- 不把 OpenAI Agents SDK 直接接入生产写回链路。
- 不在 CI 中调用真实 OpenAI API。
- 不让实验 agent 读取未脱敏病历。
- 不用自由 Manager Agent 决定是否写回 LIMS。
- 不替换现有 LangGraph 工作流。

## 后续验证清单

- 用真实 `@openai/agents` runner 替换 mock runner，只跑合成样本。
- 在 traces dashboard 中检查 model calls、tool calls、handoffs 和 guardrails。
- 把同一份合成样本分别跑 LangGraph 主链路和 Agents SDK 实验链路，比较字段准确率、证据覆盖率和复核召回。
- 评估 sandbox agents 是否适合处理批量文件预处理、评估报告生成和离线数据清洗。
