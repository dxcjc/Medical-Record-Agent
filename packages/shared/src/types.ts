/**
 * 共享类型集中描述病历识别链路中的跨包数据契约。
 *
 * 注意：
 * - 这些类型只定义结构，不包含运行时业务逻辑，也不直接调用外部服务。
 * - 涉及患者身份、病历内容、OCR 文字、模型输出、LIMS 回写等字段时，默认都应按敏感医疗数据处理。
 * - 证据字段用于追溯识别结果来源，审计字段用于追踪谁在何时做了什么操作，二者都不应被前端随意删减。
 */

/** ISO-8601 时间字符串，统一用于跨服务传输，避免 Date 对象序列化差异。 */
export type IsoDateTimeString = string;

/** 用于演示和测试数据的显式标签，避免合成数据被误认为生产数据。 */
export type DataProvenance = "synthetic" | "demo" | "production";

/**
 * 保留内置字面量提示，同时允许机构自定义字符串。
 *
 * 设计原因：
 * - 医疗场景经常需要接入院内 NAS、数据库 Blob、私有归档网关、国产云厂商或私有化模型。
 * - 如果类型写成封闭联合，后续接入会被 shared 包提前卡死；如果直接写成 string，又会丢掉内置值的补全提示。
 * - 这里使用“内置值 + 自定义字符串”的模式，让 IDE 仍提示已知内置值，同时允许合法的本地扩展标识。
 */
export type BuiltInOrCustomString<TBuiltIn extends string> = TBuiltIn | (string & {});

/** 字段值的数据类型，供表单渲染、校验和 LIMS 回写映射共同使用。 */
export type FieldValueType = "string" | "number" | "date" | "boolean" | "enum" | "text";

/** 内置存储提供方标识；真实部署可通过 StorageProvider 扩展自定义 provider。 */
export type BuiltInStorageProvider = "local" | "s3-compatible" | "lims-archive";

/**
 * 存储提供方标识。
 *
 * 内置值覆盖本地、S3 兼容对象存储和 LIMS 归档；自定义字符串用于 NAS、数据库 Blob、
 * 私有归档网关或其他院内存储能力，避免共享类型阻塞基础设施接入。
 */
export type StorageProvider = BuiltInOrCustomString<BuiltInStorageProvider>;

/** 内置模型或 OCR 厂商标识；真实部署可通过 ProviderVendor 扩展自定义厂商。 */
export type BuiltInProviderVendor = "demo" | "openai" | "azure" | "local";

/**
 * 模型或 OCR 厂商标识。
 *
 * 内置值用于演示、OpenAI、Azure 和本地服务；自定义字符串用于腾讯云、阿里云、火山引擎、
 * 私有化模型或院内部署，保证 provider 配置可以随采购和部署形态演进。
 */
export type ProviderVendor = BuiltInOrCustomString<BuiltInProviderVendor>;

/**
 * 内置审计目标类型。
 *
 * 覆盖 schema、OCR 文档和文本块、识别任务与结果、LIMS 回写、评测、用户权限体系、
 * 人工反馈、规则候选、存储文件和 provider 配置等当前领域资源。
 */
export type BuiltInAuditTargetType =
  | "field-schema"
  | "schema-version"
  | "document"
  | "ocr-document"
  | "ocr-block"
  | "storage-file"
  | "recognition-job"
  | "recognition-result"
  | "lims-writeback"
  | "provider-config"
  | "user"
  | "role"
  | "permission"
  | "feedback-submission"
  | "rule-candidate"
  | "evaluation-dataset"
  | "evaluation-sample"
  | "evaluation-run"
  | "evaluation-metric";

/**
 * 审计目标类型。
 *
 * 内置值用于统一核心资源命名；自定义字符串用于后续模块新增资源时先接入审计，
 * 避免因为 shared 包尚未发版而丢失合规追踪。
 */
export type AuditTargetType = BuiltInOrCustomString<BuiltInAuditTargetType>;

/** 内置评测指标名，覆盖常见字段准确率和分类指标。 */
export type BuiltInEvaluationMetricName = "field_accuracy" | "exact_match" | "precision" | "recall" | "f1";

/**
 * 评测指标名。
 *
 * 内置值提供常用指标提示；自定义字符串用于字段归一化得分、证据命中率、人工复核节省率等
 * 后续评测实验，避免指标体系被早期设计限制。
 */
export type EvaluationMetricName = BuiltInOrCustomString<BuiltInEvaluationMetricName>;

/** 字段校验规则只描述约束，不负责真正执行校验。 */
export interface FieldValidationRule {
  /** 规则类型，例如必填、正则、范围、枚举等。 */
  type: "required" | "regex" | "range" | "enum" | "maxLength";
  /** 面向操作者展示的中文错误提示。 */
  message: string;
  /** 规则参数，按 type 解释；这里保持 JSON 友好，方便配置下发。 */
  value?: string | number | boolean | readonly string[];
}

/** 字段定义描述单个可识别字段的业务含义和取值约束。 */
export interface FieldDefinition {
  /** 字段稳定标识，作为模型输出、人工反馈和 LIMS 映射的共同 key。 */
  key: string;
  /** 字段中文名，供界面展示和审计日志阅读。 */
  label: string;
  /** 字段值类型，决定候选值解析和展示方式。 */
  valueType: FieldValueType;
  /** 是否属于敏感医疗数据；为 true 时日志和界面应默认脱敏。 */
  sensitive: boolean;
  /** 字段说明，建议写清楚字段来源和使用边界。 */
  description: string;
  /** 可选枚举值，适用于性别、样本类型、报告结论等受控字段。 */
  enumValues?: readonly string[];
  /** 字段级校验规则，便于前端和后端复用同一份约束说明。 */
  validations?: readonly FieldValidationRule[];
}

/** Schema 版本用于追踪字段合同变更，避免历史识别结果无法解释。 */
export interface FieldSchemaVersion {
  /** 机器可比较版本号，例如 2026.06.04。 */
  id: string;
  /** 人类可读标签；fixtures 必须使用 demo 或 synthetic 标识。 */
  label: DataProvenance | string;
  /** 版本发布时间。 */
  releasedAt: IsoDateTimeString;
  /** 版本变更说明，便于审计和回放。 */
  notes: string;
}

/** 字段 Schema 是模型识别、人工校对和 LIMS 回写的核心字段合同。 */
export interface FieldSchema {
  /** Schema 唯一标识。 */
  id: string;
  /** Schema 名称。 */
  name: string;
  /** 当前版本信息。 */
  version: FieldSchemaVersion;
  /** 字段集合。 */
  fields: readonly FieldDefinition[];
}

/** OCR 文本块的几何坐标，使用归一化比例，避免依赖原图像素尺寸。 */
export interface OcrBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** OCR 块是识别证据的最小可定位单元。 */
export interface OcrBlock {
  /** OCR 块稳定标识。 */
  id: string;
  /** 页码从 1 开始，方便和病历 PDF 页码一致。 */
  pageNumber: number;
  /** OCR 原文；可能包含患者信息，落库和日志输出必须谨慎。 */
  text: string;
  /** OCR 置信度，范围 0 到 1。 */
  confidence: number;
  /** 文本块在页面中的归一化位置。 */
  boundingBox: OcrBoundingBox;
}

/** 文件对象描述上传文件本身，不包含二进制内容。 */
export interface FileObject {
  /** 文件唯一标识。 */
  id: string;
  /** 原始文件名；生产环境展示前应检查是否含敏感信息。 */
  originalName: string;
  /** MIME 类型。 */
  mimeType: string;
  /** 文件字节数。 */
  sizeBytes: number;
  /** 文件哈希，用于去重和审计，不用于还原文件内容。 */
  checksumSha256: string;
  /** 文件来源标识，区分演示数据和生产数据。 */
  provenance: DataProvenance;
}

/** 存储元数据描述文件放在哪里，以及如何做生命周期管理。 */
export interface StorageMetadata {
  /** 存储服务名称；采用内置值 + 自定义字符串，便于院内 NAS、Blob 或私有归档网关接入。 */
  provider: StorageProvider;
  /** 存储桶或逻辑空间。 */
  bucket: string;
  /** 对象键；不建议直接包含患者姓名、身份证、手机号等敏感标识。 */
  objectKey: string;
  /** 是否启用服务端加密。 */
  encrypted: boolean;
  /** 数据保留到期时间；医疗数据应按法规和机构策略设置。 */
  retentionUntil?: IsoDateTimeString;
}

/** 带存储信息的文件对象，供文档、OCR 和审计事件引用。 */
export interface StorageFile extends FileObject {
  storage: StorageMetadata;
  createdAt: IsoDateTimeString;
}

/** OCR 文档是一次识别输入的文档级表示。 */
export interface OcrDocument {
  /** 文档唯一标识。 */
  id: string;
  /** 是否为合成演示数据；fixtures 必须为 true。 */
  synthetic: boolean;
  /** 文档类型，例如住院病历、检验报告、出院小结等。 */
  documentType: "admission-record" | "lab-report" | "discharge-summary" | "other";
  /** 文档文件引用。 */
  file: StorageFile;
  /** OCR 文本块集合。 */
  ocrBlocks: readonly OcrBlock[];
  /** 创建时间。 */
  createdAt: IsoDateTimeString;
}

/** 识别任务状态用于前端轮询和后端状态机持久化。 */
export type RecognitionJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

/** 识别任务描述一次文档到结构化字段的处理过程。 */
export interface RecognitionJob {
  /** 任务唯一标识。 */
  id: string;
  /** 当前状态。 */
  status: RecognitionJobStatus;
  /** 输入文档标识。 */
  documentId: string;
  /** 使用的字段 Schema 版本。 */
  schemaVersionId: string;
  /** 使用的模型或 OCR 提供方配置标识。 */
  providerConfigId: string;
  /** 任务创建时间。 */
  createdAt: IsoDateTimeString;
  /** 任务更新时间。 */
  updatedAt: IsoDateTimeString;
  /** 失败时的可展示错误信息，不应包含原始敏感文本。 */
  errorMessage?: string;
}

/** 字段证据指向 OCR 块和局部位置，帮助人工校对模型输出。 */
export interface FieldEvidence {
  /** OCR 块标识。 */
  ocrBlockId: string;
  /** 页码，便于在预览器中定位。 */
  pageNumber: number;
  /** 证据摘录；可能包含敏感医疗文本，日志输出必须脱敏。 */
  snippet: string;
  /** 可选局部坐标，用于高亮候选值来源。 */
  boundingBox?: OcrBoundingBox;
}

/** 字段候选值是模型对某个字段的一次结构化猜测。 */
export interface FieldCandidate {
  /** 字段 key，必须来自 FieldSchema.fields。 */
  fieldKey: string;
  /** 规范化后的候选值；原始值应放入 rawValue 以便追溯。 */
  value: string | number | boolean | null;
  /** OCR 或模型原始输出值，供问题排查使用。 */
  rawValue: string;
  /** 候选置信度，范围 0 到 1。 */
  confidence: number;
  /** 候选值证据，人工复核时应优先展示。 */
  evidence: readonly FieldEvidence[];
}

/** 识别结果聚合任务输出、字段候选和人工复核状态。 */
export interface RecognitionResult {
  /** 结果唯一标识。 */
  id: string;
  /** 对应识别任务。 */
  jobId: string;
  /** 对应文档。 */
  documentId: string;
  /** 字段候选集合。 */
  fieldCandidates: readonly FieldCandidate[];
  /** 是否已经通过人工复核。 */
  reviewed: boolean;
  /** 结果生成时间。 */
  producedAt: IsoDateTimeString;
}

/** Provider 配置的通用安全参数。 */
export interface ProviderSecurityConfig {
  /** 密钥引用名称，不存放真实密钥明文。 */
  secretRef: string;
  /** 是否允许将原始 OCR 文本发送给外部模型服务。 */
  allowSensitivePayload: boolean;
  /** 请求超时时间，单位毫秒。 */
  timeoutMs: number;
}

/** OCR 或大模型提供方配置，供任务调度层选择能力和安全策略。 */
export interface ProviderConfig {
  /** 配置唯一标识。 */
  id: string;
  /** 提供方类型。 */
  kind: "ocr" | "llm" | "hybrid";
  /** 展示名称。 */
  displayName: string;
  /** 供应商名称，不等同于真实凭据；采用内置值 + 自定义字符串，兼容云厂商和私有化部署。 */
  vendor: ProviderVendor;
  /** 模型或服务版本。 */
  model: string;
  /** 是否启用。 */
  enabled: boolean;
  /** 安全和请求控制配置。 */
  security: ProviderSecurityConfig;
}

/** 权限描述一个可授权操作。 */
export interface Permission {
  /** 权限唯一标识。 */
  id: string;
  /** 权限动作，例如 document.read 或 lims.writeback。 */
  action: string;
  /** 中文说明，便于权限页面展示。 */
  description: string;
}

/** 角色聚合一组权限。 */
export interface Role {
  /** 角色唯一标识。 */
  id: string;
  /** 角色名称。 */
  name: string;
  /** 角色权限列表。 */
  permissions: readonly Permission[];
}

/** 用户表示系统操作者，生产环境不得在该结构中放密码或密钥。 */
export interface User {
  /** 用户唯一标识。 */
  id: string;
  /** 展示名；审计日志应记录操作者标识，但展示层可按需脱敏。 */
  displayName: string;
  /** 邮箱仅用于通知和登录标识，日志中应避免全量散落。 */
  email: string;
  /** 用户角色集合。 */
  roles: readonly Role[];
  /** 是否启用。 */
  active: boolean;
}

/** 审计事件记录关键操作，支持合规追踪和问题复盘。 */
export interface AuditEvent {
  /** 审计事件唯一标识。 */
  id: string;
  /** 操作者用户标识；系统任务可使用 system 用户。 */
  actorUserId: string;
  /** 操作动作，例如 recognition.reviewed 或 lims.writeback.requested。 */
  action: string;
  /** 目标资源类型；采用内置值 + 自定义字符串，避免新增资源无法进入审计链路。 */
  targetType: AuditTargetType;
  /** 目标资源标识。 */
  targetId: string;
  /** 审计发生时间，必须由可信服务端生成。 */
  occurredAt: IsoDateTimeString;
  /** 审计上下文，严禁塞入完整病历原文、身份证、手机号等敏感明文。 */
  metadata: Record<string, string | number | boolean | null>;
}

/** 人工反馈用于纠正模型输出，并作为规则候选或评测样本来源。 */
export interface FeedbackSubmission {
  /** 反馈唯一标识。 */
  id: string;
  /** 关联识别结果。 */
  recognitionResultId: string;
  /** 反馈人。 */
  submittedByUserId: string;
  /** 字段 key。 */
  fieldKey: string;
  /** 模型原候选值。 */
  originalValue: string | number | boolean | null;
  /** 人工修正值；可能属于敏感医疗数据，应按字段敏感级别保护。 */
  correctedValue: string | number | boolean | null;
  /** 反馈理由。 */
  reason: string;
  /** 提交时间。 */
  submittedAt: IsoDateTimeString;
}

/** 规则候选状态：proposed 待审核 | accepted 已接受 | rejected 已拒绝 | skipped 暂跳过 */
export type RuleCandidateStatus = "proposed" | "accepted" | "rejected" | "skipped";

/** 纠偏记录候选 proposal */
export interface CorrectionProposal {
  type: "correction";
  fieldKey: string;
  originalValue: string;
  correctedValue: string;
}

/** 结构化规则候选 proposal */
export interface RuleProposal {
  type: "rule";
  fieldKey: string;
  condition: string;
  expectedValue: string;
  evidenceCount: number;
}

export type RuleCandidateProposal = CorrectionProposal | RuleProposal;

/** 候选证据，可追溯到具体评测运行和样本 */
export interface RuleCandidateEvidence {
  runId: string;
  sampleId: string;
  fieldKey: string;
}

/** 规则候选来自反馈或评测失败样本，等待人工确认后才能进入生产规则。 */
export interface RuleCandidate {
  id: string;
  schemaKey: string;
  fieldKey: string;
  ruleType: "correction" | "rule";
  proposal: RuleCandidateProposal;
  evidence: readonly RuleCandidateEvidence[];
  status: RuleCandidateStatus;
  proposalHash: string | null;
  createdAt: IsoDateTimeString;
  decidedAt: IsoDateTimeString | null;
}

/** LIMS 回写字段映射把识别字段转换成目标系统字段。 */
export interface LimsWritebackField {
  /** 识别字段 key。 */
  sourceFieldKey: string;
  /** LIMS 目标字段 key。 */
  targetFieldKey: string;
  /** 回写值；生产环境应按目标系统规则完成脱敏和校验。 */
  value: string | number | boolean | null;
}

/** LIMS 回写请求描述一次向 LIMS 写入结构化结果的意图。 */
export interface LimsWritebackRequest {
  /** 请求唯一标识。 */
  id: string;
  /** 关联识别结果。 */
  recognitionResultId: string;
  /** LIMS 样本或任务标识；fixtures 只能使用演示编号。 */
  limsSampleId: string;
  /** 回写字段集合。 */
  fields: readonly LimsWritebackField[];
  /** 请求人。 */
  requestedByUserId: string;
  /** 请求时间。 */
  requestedAt: IsoDateTimeString;
}

/** LIMS 回写结果记录目标系统响应和错误摘要。 */
export interface LimsWritebackResult {
  /** 结果唯一标识。 */
  id: string;
  /** 对应请求。 */
  requestId: string;
  /** 回写状态。 */
  status: "pending" | "success" | "failed" | "partial";
  /** LIMS 侧回执编号。 */
  externalReceiptId?: string;
  /** 错误摘要，不能包含完整敏感病历原文。 */
  errorMessage?: string;
  /** 完成时间。 */
  completedAt?: IsoDateTimeString;
}

/** 评测真值描述某个字段的标准答案。 */
export interface GroundTruthField {
  /** 字段 key。 */
  fieldKey: string;
  /** 标准答案。 */
  value: string | number | boolean | null;
}

/** 评测样本用于离线衡量识别质量，必须区分合成样本和生产脱敏样本。 */
export interface EvaluationSample {
  /** 样本唯一标识。 */
  id: string;
  /** 文档标识。 */
  documentId: string;
  /** 数据来源标识。 */
  provenance: DataProvenance;
  /** 字段真值集合。 */
  groundTruth: readonly GroundTruthField[];
}

/** 评测数据集聚合一批样本和使用的 Schema 版本。 */
export interface EvaluationDataset {
  /** 数据集唯一标识。 */
  id: string;
  /** 数据集名称。 */
  name: string;
  /** 关联 Schema 版本。 */
  schemaVersionId: string;
  /** 样本集合。 */
  samples: readonly EvaluationSample[];
  /** 创建时间。 */
  createdAt: IsoDateTimeString;
}

/** 评测指标记录单项质量度量。 */
export interface EvaluationMetric {
  /** 指标名称；采用内置值 + 自定义字符串，支持后续实验指标扩展。 */
  name: EvaluationMetricName;
  /** 指标值，通常范围 0 到 1。 */
  value: number;
  /** 可选字段 key；为空表示整体指标。 */
  fieldKey?: string;
}

/** 评测运行记录某次模型和数据集的离线评估结果。 */
export interface EvaluationRun {
  /** 运行唯一标识。 */
  id: string;
  /** 使用的数据集。 */
  datasetId: string;
  /** 使用的 provider 配置。 */
  providerConfigId: string;
  /** 评测状态。 */
  status: "queued" | "running" | "completed" | "failed";
  /** 指标集合。 */
  metrics: readonly EvaluationMetric[];
  /** 启动时间。 */
  startedAt: IsoDateTimeString;
  /** 完成时间。 */
  completedAt?: IsoDateTimeString;
}
