# 基于 TypeScript 的通用病历识别 Agent 设计

## 目标

设计一个基于 TypeScript 的通用病历识别 Agent 服务。它面向病历图片、PDF、扫描件和已有 OCR 文本，输出结构化字段候选结果、字段证据、置信度、质量告警和可选业务系统 payload。

这个 Agent 不是 LIMS 专用能力。LIMS 临床信息弹窗字段是第一套默认字段 preset、payload adapter 和写回 adapter。Agent 默认输出候选结果和 payload，由调用方人工确认；在调用方明确确认后，Agent 可以通过受控的 LIMS 写回 adapter 调用 LIMS 接口。Agent 提供反馈 API，用于沉淀评估样本、规则候选和 schema/prompt 版本优化依据。

## 已确认范围

- 服务形态：独立 TypeScript Agent 服务。
- 架构方向：分层服务架构 + LangGraph Agent 工作流。
- Agent 技术栈：主线使用 LangGraph.js + LangChain.js；OpenAI Responses / Agents SDK 作为 provider 和实验区；Mastra、LlamaIndex.TS 先作为技术对比和后续候选。
- 字段策略：字段 Schema 配置驱动。
- 第一套字段：基于 LIMS 临床信息弹窗字段。
- 输入文件：图片、PDF、扫描件，后续可支持已有 OCR 文本。
- 识别链路：OCR + LLM 混合方案。
- 部署模式：Provider 双模式，支持内网私有化和公网原型服务。
- 输出策略：结构化候选 JSON + 可选业务 payload。
- 人工确认：放在调用方系统，Agent 提供反馈回流 API 和受控写回 API。
- 真实 Provider：需要接入真实 OCR provider 和真实 LLM provider，同时保留 mock provider 作为测试后备。
- 生产存储：需要生产级文件、OCR、结果、反馈和评估样本存储。
- 权限登录：需要生产级登录、角色权限、审计和敏感操作控制。
- LIMS 写回：满足高置信自动写回规则后可自动写回；未达标时输出候选并进入复核队列。
- 多 Agent 策略：第一阶段采用 LangGraph 节点内受控 specialist agent；第二阶段升级 Manager + Specialist 多 Agent。
- RAG 策略：第一阶段采用轻量术语/字典 RAG；第二阶段升级完整医学知识库。
- Schema 管理：需要在线编辑、校验、版本发布、停用和回滚。
- 真实评估：需要使用真实脱敏病历样本做字段级评估和版本回归。
- Demo 前端：提供精致多页面测试台，使用 step.js 做引导。

## 非目标

- 不做无规则静默写回。所有 LIMS 写回都必须满足自动写回策略、权限校验、幂等校验和审计记录；未满足条件时必须阻断或进入复核。
- 不把人工反馈直接自动发布到生产 schema 或 prompt。反馈先形成规则候选和评估样本，发布必须经过人工审核。
- 不把 Agent 前端替代 LIMS 的正式业务页面。Demo 前端用于测试、演示、评估、配置和运维；生产确认仍可由 LIMS 或调用方系统承载。
- 不把真实病历原文无控制地发送到公网 provider。公网 provider 必须通过配置开关、脱敏策略和审计控制。
- 不绑定单一 OCR 或 LLM 厂商。真实 provider 作为可替换插件接入。

## 整体架构

系统采用分层架构：

1. API Layer
   - 创建识别任务。
   - 上传或绑定病历文件。
   - 查询任务状态。
   - 获取识别结果。
   - 提交人工反馈。

2. Job Orchestrator
   - 负责创建任务、加载配置、持久化状态，并启动 LangGraph 工作流。
   - 不直接承载复杂分支逻辑，复杂编排放入 Agent Workflow Layer。

3. Agent Workflow Layer
   - 使用 LangGraph.js 表达病历识别状态图。
   - 节点包括文件预处理、OCR Tool、轻量 RAG、Extraction Agent、Validation Agent、Auto Decision Policy、Writeback Agent、Evaluation Agent。
   - 负责节点状态、条件分支、失败路径、自动写回路径和复核路径。

4. Document Pipeline
   - PDF 拆页。
   - 图片标准化。
   - OCR 调用。
   - OCR 文本块归并。
   - 跨页内容合并。
   - 文档章节切分。
   - 生成质量告警。

5. Extraction Engine
   - 按 Field Schema 调用 LLM。
   - 默认通过 LangChain.js 做 prompt、structured output、tool 封装。
   - 抽取字段值、归一值、证据片段、页码、坐标和置信度。
   - 支持分字段、分字段组或全量抽取。

6. Validation Engine
   - 枚举归一。
   - 日期、数值、布尔值格式化。
   - 字段冲突检测。
   - 必填字段缺失检测。
   - 低置信和证据缺失标记。

7. Schema Registry
   - 管理字段 schema。
   - 管理 schema 版本。
   - 内置第一版 `lims-clinical-info` preset。
   - 后续支持复制、发布、停用和对比。

8. Payload Adapter
   - 把通用识别结果转换成业务系统 payload。
   - 提供 `generic-json`、`lims-clinical-payload` 和 `lims-writeback`。
   - `lims-writeback` 只在自动写回策略通过或调用方显式确认后执行，并记录审计。

9. Feedback Store
   - 接收调用方人工确认和修正结果。
   - 保存错误类型、字段修正、证据判断和版本信息。
   - 形成评估样本、规则候选和回归样本。

10. Provider Layer
   - 抽象 OCR、LLM、存储、队列、审计日志。
   - 支持内网私有化 provider 和公网 provider。

11. Auth And Audit Layer
   - 管理用户登录、角色权限、API token、写回权限和审计日志。
   - 对文件下载、结果查看、schema 发布、LIMS 写回等敏感操作做权限控制。

12. Evaluation Layer
   - 管理真实脱敏样本集、标注结果、评估运行和版本对比。
   - 支持字段级准确率、证据覆盖率、低置信召回率和 provider/prompt/schema 回归。

13. Knowledge Layer
   - 第一阶段保存医学术语、癌种别名、LIMS 字典、字段说明和枚举映射。
   - 通过轻量 RAG 节点辅助字段抽取和归一化。
   - 第二阶段可升级为完整知识库和 RAG 检索体系。

## Agent 技术栈

最终选择平衡路线：

- LangGraph.js：主工作流引擎，用于表达 OCR、抽取、校验、自动决策、写回和评估节点。
- LangChain.js：默认 LLM 调用层，用于 prompt template、structured output、tool 封装和轻量 RAG。
- OpenAI Responses API：作为一个真实模型 provider 和实验区，用于学习工具调用、结构化输出和 tracing 思路。
- OpenAI Agents SDK：第二阶段用于多 Agent 对照实验，不作为第一阶段主链路。
- LlamaIndex.TS：第二阶段完整医学知识库/RAG 的候选。
- Mastra：作为 TypeScript Agent 框架对比对象，先不进入主链路。

## Provider 双模式与双层 ModelProvider

Provider 层至少包含：

- OcrProvider：负责图片/PDF OCR，返回文本块、页码、坐标和质量信息。
- ModelProvider：负责字段理解、归并和抽取。
- StorageProvider：负责原始文件、拆页图片、OCR 结果和任务结果存储。
- QueueProvider：负责异步任务。
- AuditLogger：负责记录 provider、模型版本、schema 版本、耗时和错误。

ModelProvider 采用双层设计：

- 上层是自研 `ModelProvider` 接口，稳定服务内部调用边界。
- 下层实现 `LangChainModelProvider`，作为默认主线，用于学习 LangChain prompt、tool 和 structured output。
- 下层实现 `OpenAICompatibleProvider`，用于生产环境直连 OpenAI-compatible 内网模型网关或公网模型服务。
- 下层实现 `OpenAIResponsesProvider`，用于 OpenAI Responses API 实验、工具能力和 tracing 对照。
- 下层保留 `MockModelProvider`，用于自动化测试和评估回归。

真实 OCR provider 第一版建议优先实现一个 HTTP OCR adapter。它通过配置接入内网 OCR 服务或公网 OCR 服务，统一返回 `RecognizedDocument`。真实 LLM provider 第一版同时实现 `LangChainModelProvider` 和 `OpenAICompatibleProvider`，默认使用 LangChain 主线，生产可切换到 HTTP 直连。

内网模式下，病历原件默认留在内网，OCR、LLM、存储和日志都使用内部能力。公网原型模式下，可接外部 OCR 或 LLM，但必须通过配置显式开启，并支持脱敏策略、审计记录和开关控制。

## 多 Agent 策略

第一阶段采用轻量多 Agent。每个 Agent 都是 LangGraph 节点内的受控 specialist，输入、输出、工具权限和 schema 固定：

- Extraction Agent：按字段 schema 和 RAG 上下文抽取字段候选。
- Validation Agent：检查证据、置信度、冲突、枚举归一和写回风险。
- Writeback Agent：校验 LIMS payload、权限、幂等键和写回结果。
- Evaluation Agent：把识别结果、反馈和真实样本转成评估指标和规则候选。

第二阶段升级为完整多 Agent：

- Manager Agent 根据文档质量、字段风险、写回策略和评估目标调度 specialist。
- Specialist Agents 负责抽取、医学术语判断、校验、写回、评估和规则候选。
- 引入 tracing，记录 agent 输入、输出、工具调用、handoff 和耗时。

## RAG 策略

第一阶段采用轻量 RAG：

- 术语库：癌种别名、病理术语、常见缩写。
- LIMS 字典：枚举值、字段说明、payload 映射说明。
- 字段说明库：每个字段的抽取规则、反例、证据要求。
- 检索方式：可先用内存向量或关键词检索，保持接口可替换。

第二阶段升级完整知识库：

- 接入 LlamaIndex.TS 或 LangChain retriever。
- 管理医学知识、历史反馈样本、字段标注规范和 LIMS 字典版本。
- 支持知识库版本对比和评估回归。

## 生产存储

生产存储至少分为五类：

- FileStore：保存原始病历、拆页图片、预览图和下载权限。
- JobStore：保存任务状态、进度、错误、provider 版本和耗时。
- ResultStore：保存 OCR 文本、字段候选、证据和 payload。
- FeedbackStore：保存人工确认、字段修正、错误类型和规则候选。
- EvaluationStore：保存脱敏样本集、标注答案、评估运行和版本对比。

第一版生产实现可以使用 PostgreSQL 保存结构化数据，使用本地磁盘或 S3/MinIO 兼容对象存储保存文件。开发环境保留内存存储和本地文件存储，便于测试。

## 权限登录与审计

系统需要支持：

- 用户登录。
- 角色权限：管理员、配置管理员、识别操作员、评估员、只读查看者。
- API token：供 LIMS 或其他调用方服务端调用。
- 权限点：上传文件、查看病历、创建任务、查看结果、提交反馈、执行 LIMS 写回、编辑 schema、发布 schema、运行评估、查看审计。
- 审计日志：记录用户、动作、对象、请求来源、前后状态、结果和时间。

LIMS 写回、schema 发布、真实样本删除、provider 配置修改都属于高风险操作，必须记录审计。

## 核心数据模型

### FieldSchema

字段配置是识别的核心。每个字段需要包含：

- key：通用字段 key，例如 `clinicalDiagnosis`。
- label：展示名称，例如“临床诊断”。
- type：字段类型，例如文本、枚举、日期、数值、布尔、列表、对象。
- required：是否必填。
- description：字段解释。
- aliases：病历中可能出现的别名，例如“诊断”“初步诊断”“入院诊断”。
- examples：正反例或典型值。
- extractPrompt：字段抽取提示。
- evidencePolicy：证据要求，例如必须返回原文片段、页码和坐标。
- confidencePolicy：置信度分级策略。
- enumMap：枚举映射和同义词归一。
- normalizers：日期、性别、吸烟状态、癌种等归一化函数。
- validators：格式、范围、必填、冲突检测规则。
- adapterHints：业务映射提示，例如目标字段路径、payload 分组和合并策略。

生成代码时，字段 schema、normalizer、validator 和 adapter 需要写详细注释，说明字段含义、业务来源和归一化原因。

### RecognitionJob

任务需要记录：

- jobId。
- status。
- schemaId。
- schemaVersion。
- adapterId。
- provider 配置摘要。
- sourceFiles。
- createdAt、updatedAt、startedAt、completedAt。
- progress。
- warnings。
- errors。

### RecognizedDocument

文档结构需要记录：

- 文件名、文件类型、大小。
- 页数。
- 每页图片或文本信息。
- OCR 文本块。
- 文本块页码和坐标。
- OCR provider 和版本。
- 文档质量告警，例如模糊、倾斜、空白页、低 OCR 置信度。

### FieldCandidate

每个字段结果需要记录：

- fieldKey。
- label。
- value。
- normalizedValue。
- confidence。
- evidence。
- warnings。
- status，例如 `found`、`missing`、`low_confidence`、`conflict`、`not_applicable`。
- sourceProvider。

证据需要包含：

- 原文片段。
- 页码。
- 坐标。
- OCR blockId。
- 必要时包含模型解释。

### RecognitionResult

任务结果包含：

- job 信息。
- document 信息。
- fields 字段候选。
- payloads 业务 payload。
- summary 摘要。
- warnings。
- errors。

## 第一版 LIMS 临床信息字段 preset

第一版内置 `lims-clinical-info` preset，核心字段包括：

- 临床诊断。
- 癌种。
- 转移部位。
- 免疫组化。
- 基因检测。
- 吸烟史。
- 吸烟时长。
- 平均每日吸烟量。
- 是否已戒烟。
- 已戒烟时间。
- 家族史。
- 用药史。
- 手术史。
- 放疗史。
- 疾病史。

患者姓名、性别、年龄、证件号、联系电话等基础信息可以作为可选字段。它们可用于 Demo 和通用病历结构化，但第一版不应强制所有业务系统都使用这些字段。

## 处理流程与状态机

主流程由 LangGraph 工作流承载：

1. Preprocess Node
   - 文件格式检查、PDF 拆页、图片质量分析、脱敏策略判断。

2. OCR Tool Node
   - 调用真实 OCR provider 或 mock OCR provider。
   - 输出 OCR 文本块、页码、坐标和质量告警。

3. Light RAG Node
   - 根据 schema、字段说明、癌种术语、LIMS 字典检索上下文。
   - 为 Extraction Agent 提供字段定义、别名、枚举和反例。

4. Extraction Agent Node
   - 使用 LangChain.js 调用 `ModelProvider`。
   - 通过 structured output 生成字段候选、证据、置信度和解释。

5. Validation Agent Node
   - 校验证据完整性、字段冲突、枚举归一、关键字段置信度和 payload 可写性。

6. Auto Decision Policy Node
   - 输出 `green`、`yellow`、`red` 决策。
   - `green` 表示满足自动写回条件。
   - `yellow` 表示输出候选并进入复核队列。
   - `red` 表示阻断写回并记录失败原因。

7. Writeback Agent Node
   - 仅在 `green` 或调用方显式确认后执行。
   - 校验权限、幂等键、LIMS adapter 健康状态并执行写回。

8. Evaluation Agent Node
   - 记录评估样本、反馈样本、规则候选和版本指标。

任务状态：

- created：任务已创建，文件和 schema 已绑定。
- preprocessing：文件预处理，包括 PDF 拆页、图片清洗、格式检查。
- ocr_running：OCR 执行中。
- extracting：字段抽取中。
- validating：字段校验和归一化中。
- completed：识别完成。
- partial_completed：部分字段完成，部分字段低置信或缺证据。
- needs_review：关键字段缺失、冲突或低质量，需要人工复核。
- failed：任务失败。
- cancelled：任务取消。
- writeback_pending：满足自动写回条件，等待写回执行。
- writeback_running：LIMS 写回执行中。
- writeback_completed：LIMS 写回成功。
- writeback_failed：LIMS 写回失败。

错误分类：

- 输入错误：文件格式不支持、文件损坏、文件过大、页数超限。
- Provider 错误：OCR 或 LLM 超时、限流、不可用、返回格式异常。
- 识别错误：低置信、证据不足、字段冲突、枚举无法归一。
- 系统错误：存储、队列、数据库或配置版本缺失。

返回策略：

- 能返回部分结果时，不直接标记任务失败。
- 每个字段都带 warnings 和 status。
- 可重试错误设置 `retryable=true`。
- 不可重试错误必须提供明确原因。

自动写回 green 条件：

- 关键字段都有证据片段和页码。
- 关键字段置信度达到策略阈值。
- 诊断、癌种、病史、样本信息无冲突。
- schema 是已发布版本。
- 调用方或系统 token 具备写回权限。
- LIMS payload 校验通过。
- LIMS writeback adapter 健康。
- 当前环境允许自动写回。

自动写回 red 阻断条件：

- 关键证据缺失。
- OCR 质量过低。
- 多个关键字段互相冲突。
- schema 是草稿或已停用版本。
- token 权限不足。
- payload 校验失败。
- provider 不稳定或返回格式异常。

## API 设计

### Schema API

- 查询可用 schema。
- 获取 schema 详情。
- 获取 `lims-clinical-info` preset。
- 后续支持 schema 版本发布和停用。

### Job API

- 创建识别任务。
- 上传或绑定文件。
- 查询任务状态。
- 取消任务。
- 获取任务日志摘要。

### Result API

- 获取结构化字段候选。
- 获取字段证据、页码、坐标、置信度和 warnings。
- 获取按 adapter 生成的业务 payload。
- 支持按字段组获取结果。

### Feedback API

- 提交人工确认结果。
- 提交字段修正值。
- 标记错误类型。
- 关联 schema 版本、provider 版本、模型版本。
- 形成评估样本和规则候选。

### Writeback API

- 预览 LIMS 写回 payload。
- 校验当前用户是否有写回权限。
- 校验任务是否满足自动写回策略或已由调用方显式确认。
- 查询自动写回策略判断结果。
- 执行 LIMS 写回。
- 查询写回状态和错误。
- 记录写回审计。

写回 API 只允许调用 `lims-writeback` adapter。写回失败时不能覆盖原识别结果，必须保留失败原因和可重试标记。

### Schema Management API

- 创建 schema 草稿。
- 编辑字段、枚举、normalizer 配置和 adapter hints。
- 校验 schema。
- 发布 schema 新版本。
- 停用 schema 版本。
- 回滚到历史版本。
- 对比两个 schema 版本。

### Evaluation API

- 上传脱敏样本。
- 录入或导入字段标注答案。
- 创建评估运行。
- 查询评估结果。
- 对比不同 schema、prompt、OCR provider、LLM provider 的效果。
- 将人工反馈转为评估样本。

典型调用链：

1. 调用方选择 schema。
2. 调用方上传病历图片或 PDF。
3. 调用方创建识别任务。
4. 调用方轮询或订阅任务状态。
5. 调用方获取候选 JSON 和 payload。
6. Agent 根据自动写回策略判断 `green`、`yellow`、`red`。
7. `green` 时自动执行受控 LIMS 写回。
8. `yellow` 时调用方展示人工复核页面。
9. `red` 时阻断写回并展示失败原因。
10. 调用方把人工修正反馈给 Agent。

## Demo 前端设计

Demo 前端定位为 Medical Record Agent Studio。它用于测试、演示、评估和调参，不替代 LIMS 或其他业务系统的正式人工确认页面。

建议技术栈：

- Vite。
- React。
- TypeScript。
- step.js 引导。
- 与 Agent 服务放在同一仓库，建议结构为 `apps/api`、`apps/demo-web`、`packages/core`、`packages/shared`。

页面结构：

1. Dashboard 仪表盘
   - 最近识别任务。
   - 任务成功率。
   - 平均耗时。
   - 低置信字段。
   - Provider 健康状态。

2. New Recognition 新建识别
   - 上传病历图片或 PDF。
   - 选择 schema。
   - 选择 adapter。
   - 选择 OCR provider。
   - 选择 LLM provider。
   - 选择 LangGraph 工作流版本。
   - 选择是否开启自动写回。
   - 设置脱敏开关。
   - 启动识别任务。

3. Job Detail 任务详情
   - 左侧显示文档、PDF 或图片预览。
   - 中间显示字段候选列表。
   - 右侧显示字段证据、warnings、payload 和 feedback 模拟。
   - 支持查看 OCR 文本、页码、坐标和质量告警。
   - 支持查看 LangGraph 节点轨迹和自动写回决策。

4. Schema Studio 字段配置
   - 展示字段 schema。
   - 展示字段分组。
   - 展示枚举、normalizer、validator、adapter hints。
   - 支持 schema 草稿编辑、校验、发布、停用和版本对比。

5. Evaluation 评估报告
   - 字段准确率。
   - 证据覆盖率。
   - needs_review 召回。
   - provider、prompt、schema 版本对比。
   - 支持真实脱敏样本集评估运行。

6. Feedback Samples 反馈样本
   - 人工修正样本。
   - 错误类型。
   - 规则候选。
   - 回归样本状态。

7. Provider Settings
   - OCR provider 配置。
   - LLM provider 配置。
   - Storage provider 配置。
   - 连通性测试和健康状态。
   - 支持 LangChainModelProvider、OpenAICompatibleProvider、OpenAIResponsesProvider 和 MockModelProvider 切换。

8. Auth And Audit 权限与审计
   - 用户、角色、API token。
   - 审计日志查询。
   - 高风险操作记录。

9. Writeback 写回控制台
   - 查看可写回任务。
   - 预览 LIMS payload。
   - 查看自动写回策略判断。
   - 执行确认后写回。
   - 查看写回结果和错误。

step.js 首次引导路线：

1. 查看当前环境和 provider 状态。
2. 进入新建识别任务。
3. 上传图片或 PDF。
4. 选择 `lims-clinical-info` schema。
5. 选择 `generic-json` 或 `lims-clinical-payload` adapter。
6. 启动识别任务。
7. 查看状态流转。
8. 检查字段候选、置信度和证据。
9. 查看生成的 payload。
10. 修改一个字段并提交 feedback 模拟。
11. 打开 Evaluation 查看评估指标。
12. 预览 LIMS 写回 payload。
13. 查看自动写回 green/yellow/red 判断。
14. 在有权限且策略通过时执行测试写回。

Demo 前端设计要求：

- 界面要精致，不能做成临时表单。
- 多页面导航清晰。
- 任务详情页要突出证据和字段质量。
- 按钮和状态变化必须有可见反馈。
- 文本不能遮挡或溢出。
- Demo 前端可以模拟调用方人工确认，但必须明确它不是生产人审页面。

## 测试与评估

核心指标：

- 字段准确率：字段级统计 exact match、归一后 match、人工可接受 match。
- 证据可用率：字段是否带页码、原文片段和坐标。
- 低置信召回率：不确定字段是否能正确标记 `needs_review`。
- 任务成功率：成功、部分成功、失败、重试成功。
- 平均耗时：OCR、LLM、校验、总耗时。
- 反馈质量：人工修正是否能沉淀为评估样本和规则候选。
- 版本回归：schema、prompt、provider 变更后，用固定样本集对比效果。

第一版建议准备 20-50 份脱敏病历样本作为起步集，后续扩展到按癌种、医院、文件类型、质量等级分层的真实评估集。样本必须脱敏，并保存标注人、标注时间、字段答案和证据位置。

- 清晰扫描件。
- 模糊图片。
- 多页 PDF。
- 字段缺失。
- 同一字段多处出现。
- 诊断和病史冲突。
- 枚举归一困难。

测试层次：

- 单元测试：schema 校验、normalizer、validator、payload adapter。
- 集成测试：OCR provider mock、LLM provider mock、任务状态流转。
- 端到端评估：脱敏样本集跑完整任务，生成字段级评估报告。

## 实施建议

第一阶段：完成基础 monorepo、核心类型、schema、mock provider、API 和精致 Demo，确保端到端闭环可运行。

第二阶段：接入 LangGraph 工作流、LangChain structured output、轻量 RAG 和受控 specialist agent。

第三阶段：接入生产存储、用户登录、角色权限、API token 和审计日志。

第四阶段：接入真实 OCR provider、LangChainModelProvider、OpenAICompatibleProvider 和 OpenAIResponsesProvider，保留 mock provider 用于测试。

第五阶段：实现 Schema Studio 在线编辑、校验、发布、停用、回滚和版本对比。

第六阶段：实现自动决策策略、LIMS 写回 adapter、Writeback API 和写回控制台。

第七阶段：实现真实脱敏样本评估、标注管理、评估运行和版本回归报告。

第八阶段：做 OpenAI Agents SDK 多 Agent 对照实验，评估是否升级为 Manager + Specialist 模式。

## 待确认问题

- 第一版真实 OCR provider 的具体接口协议、鉴权方式和部署位置。
- 第一版真实 LLM provider 是 OpenAI-compatible 接口、内网大模型网关，还是指定厂商 SDK。
- LangChainModelProvider 默认接哪个模型和 structured output 模式。
- OpenAIResponsesProvider 是否需要启用工具调用和 tracing。
- 自动写回关键字段、置信度阈值和环境开关。
- 轻量 RAG 第一批术语库、LIMS 字典和字段说明来源。
- 生产存储使用 PostgreSQL + 本地文件、PostgreSQL + MinIO，还是已有企业存储。
- 登录接入方式是本地账号、企业 SSO，还是 LIMS token 换取。
- LIMS 写回接口路径、鉴权方式、幂等键、回滚策略和测试环境地址。
- Schema 发布是否需要双人审核。
- 第一批真实脱敏病历样本来源、脱敏责任人和标注规范。
