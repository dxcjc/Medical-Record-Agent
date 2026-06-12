# 医疗 OCR 识别系统 — UI/UX 全面重构头脑风暴

你是产品经理助手。请对「医疗OCR识别系统」进行 UI/UX 全面重构的头脑风暴。

## 项目背景
- 定位：医疗文档OCR结构化识别系统
- 用户：医院/检验科行政人员或LIMS操作员（非技术人员）
- 核心流程：上传文档 → OCR识别 → LLM抽取结构化数据 → 查看/编辑/导出结果
- 技术栈：React + TypeScript + Arco Design + Fastify + Prisma + SQLite
- 端口：9901（前端），3000（API）
- UI风格：Material + Arco，白侧栏 + pill高亮 + 蓝 #3370FF + 灰 #F7F8FA

## 当前问题
页面过多（12+页）、操作路径不清晰、术语对非技术用户不友好、报错直接写在页面上、缺少引导、Schema/Provider等概念对普通用户太复杂

## 当前页面列表
LoginPage, DashboardPage, NewRecognitionPage, JobDetailPage, SchemaStudioPage, EvaluationPage, ProviderSettingsPage, AuditLogPage, WritebackPage, FeedbackSamplesPage, AgentTracePage, DatasetSpecPage, NotFoundPage

## 当前后端API路由
- POST /auth/login, POST /auth/logout
- GET/POST /files — 文件上传
- POST /jobs, GET /jobs/:id — 识别任务
- GET /providers — Provider列表
- GET /schemas, POST /schemas/drafts — Schema管理
- GET /evaluations/datasets — 评测数据集
- POST /results/:jobId — 识别结果

## 重构方向

### 一级导航只保留4个
1. **工作台** (Dashboard) — 快捷操作+今日统计+最近任务+首次引导
2. **识别任务** (Jobs) — 任务列表+新建识别（引导式向导）+任务详情
3. **数据管理** (Data) — Schema管理+已确认数据+导出
4. **系统设置** (Settings) — Provider配置+评测+审计日志+Agent追踪

### P0 — 用户体验核心
1. **报错改用 toast/message** — 统一用 Message/Notification 弹出
2. **识别流程闭环** — 上传→识别→查看→编辑→确认→导出，一条路径
3. **任务状态实时反馈** — 轮询+进度条
4. **空状态引导** — 首次使用3步引导
5. **结果查看简化** — 分层展示，核心字段优先

### P1 — 操作简化
6. **新建识别简化** — 用识别类型（血常规/生化）代替Schema/Provider选择
7. **确认+导出一体化** — 结果页直接有「确认并导出」按钮
8. **表单校验优化** — 实时校验+中文提示
9. **Schema管理隐藏** — 放到高级设置

## 你的任务
1. 读取前端源码了解现状（重点看 src/pages/ 和 src/App.tsx）
2. 逐条分析上述优化点，提出疑问和建议
3. 补充被遗漏的优化点
4. 分析现有后端API与新页面结构的映射关系（哪些API需要适配）
5. 提出具体的实现方案
6. 识别技术风险

## 输出要求
- 全部用中文
- 输出到文件：/tmp/Medical-Record-Agent/UI-REDESIGN-BRAINSTORM.md
- 对每个优化点：现状分析、问题/疑问、建议方案、优先级、技术风险
- 分析现有API与新页面的映射，标注需要新增或修改的API
- 如果有需要产品经理决策的问题，单独列出「需要决策的问题」章节
- 最后给出推荐的执行顺序
- 完成后在文件末尾写上 `---头脑风暴完成---`
