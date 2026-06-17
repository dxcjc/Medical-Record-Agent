import type {
  AuditEvent,
  EvaluationDataset,
  EvaluationMetric,
  EvaluationRun,
  FeedbackSubmission,
  FieldSchema,
  LimsWritebackRequest,
  LimsWritebackResult,
  OcrDocument,
  ProviderConfig,
  RecognitionJob,
  RecognitionResult,
  RuleCandidate,
  StorageFile,
  User
} from "./types";

// 本文件只放合成演示数据，禁止放真实患者姓名、身份证、手机号、住院号、病历号或生产系统回执。
// 所有 ID 都使用 demo/synthetic 前缀，便于测试和人工检查时快速识别数据来源。

export const demoFieldSchema: FieldSchema = {
  id: "demo-schema-medical-record",
  name: "合成病历识别字段 Schema",
  version: {
    id: "2026.06.04-demo",
    label: "demo",
    releasedAt: "2026-06-04T08:00:00.000Z",
    notes: "用于 Task 2 共享类型验证的合成字段合同。"
  },
  fields: [
    {
      key: "patient_alias",
      label: "患者演示代号",
      valueType: "string",
      sensitive: true,
      description: "演示环境使用的患者代号，不代表真实姓名；生产环境同类字段必须脱敏展示。",
      validations: [{ type: "required", message: "患者演示代号不能为空" }]
    },
    {
      key: "sample_type",
      label: "样本类型",
      valueType: "enum",
      sensitive: false,
      description: "用于演示 LIMS 字段映射的受控样本类型。",
      enumValues: ["外周血", "组织切片", "胸水"]
    },
    {
      key: "clinical_summary",
      label: "临床摘要",
      valueType: "text",
      sensitive: true,
      description: "可能包含诊断、症状和治疗信息，生产环境日志中不得输出完整内容。",
      validations: [{ type: "maxLength", message: "临床摘要过长", value: 500 }]
    }
  ]
};

export const demoStorageFile: StorageFile = {
  id: "demo-file-001",
  originalName: "synthetic-admission-record.pdf",
  mimeType: "application/pdf",
  sizeBytes: 248_000,
  checksumSha256: "demoabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef",
  provenance: "synthetic",
  storage: {
    provider: "local",
    bucket: "demo-medical-records",
    objectKey: "synthetic/records/demo-file-001.pdf",
    encrypted: true,
    retentionUntil: "2027-06-04T00:00:00.000Z"
  },
  createdAt: "2026-06-04T08:05:00.000Z"
};

export const demoOcrDocument: OcrDocument = {
  id: "demo-document-001",
  synthetic: true,
  documentType: "admission-record",
  file: demoStorageFile,
  ocrBlocks: [
    {
      id: "demo-ocr-block-001",
      pageNumber: 1,
      text: "患者代号：DEMO-PATIENT-A；样本类型：外周血。",
      confidence: 0.98,
      boundingBox: { x: 0.08, y: 0.12, width: 0.52, height: 0.04 }
    },
    {
      id: "demo-ocr-block-002",
      pageNumber: 1,
      text: "临床摘要：合成病例用于演示结构化识别，不对应任何真实个人。",
      confidence: 0.96,
      boundingBox: { x: 0.08, y: 0.2, width: 0.72, height: 0.05 }
    }
  ],
  createdAt: "2026-06-04T08:06:00.000Z"
};

export const demoProviderConfig: ProviderConfig = {
  id: "demo-provider-hybrid-001",
  kind: "hybrid",
  displayName: "演示 OCR 与结构化识别提供方",
  vendor: "demo",
  model: "demo-medical-record-v1",
  enabled: true,
  security: {
    secretRef: "demo/no-real-secret",
    allowSensitivePayload: false,
    timeoutMs: 30_000
  }
};

export const demoRecognitionJob: RecognitionJob = {
  id: "demo-job-001",
  status: "completed",
  documentId: demoOcrDocument.id,
  schemaVersionId: demoFieldSchema.version.id,
  providerConfigId: demoProviderConfig.id,
  createdAt: "2026-06-04T08:10:00.000Z",
  updatedAt: "2026-06-04T08:11:00.000Z"
};

export const demoRecognitionResult: RecognitionResult = {
  id: "demo-result-001",
  jobId: demoRecognitionJob.id,
  documentId: demoOcrDocument.id,
  reviewed: true,
  producedAt: "2026-06-04T08:11:00.000Z",
  fieldCandidates: [
    {
      fieldKey: "patient_alias",
      value: "DEMO-PATIENT-A",
      rawValue: "DEMO-PATIENT-A",
      confidence: 0.99,
      evidence: [
        {
          ocrBlockId: "demo-ocr-block-001",
          pageNumber: 1,
          snippet: "患者代号：DEMO-PATIENT-A",
          boundingBox: { x: 0.08, y: 0.12, width: 0.28, height: 0.04 }
        }
      ]
    },
    {
      fieldKey: "sample_type",
      value: "外周血",
      rawValue: "外周血",
      confidence: 0.97,
      evidence: [
        {
          ocrBlockId: "demo-ocr-block-001",
          pageNumber: 1,
          snippet: "样本类型：外周血",
          boundingBox: { x: 0.38, y: 0.12, width: 0.2, height: 0.04 }
        }
      ]
    },
    {
      fieldKey: "clinical_summary",
      value: "合成病例用于演示结构化识别，不对应任何真实个人。",
      rawValue: "合成病例用于演示结构化识别，不对应任何真实个人。",
      confidence: 0.94,
      evidence: [
        {
          ocrBlockId: "demo-ocr-block-002",
          pageNumber: 1,
          snippet: "合成病例用于演示结构化识别",
          boundingBox: { x: 0.18, y: 0.2, width: 0.42, height: 0.05 }
        }
      ]
    }
  ]
};

export const demoUser: User = {
  id: "demo-user-reviewer",
  displayName: "演示复核员",
  email: "reviewer@example.invalid",
  active: true,
  roles: [
    {
      id: "demo-role-reviewer",
      name: "演示复核角色",
      permissions: [
        {
          id: "demo-permission-document-read",
          action: "document.read",
          description: "查看合成病历文档"
        },
        {
          id: "demo-permission-lims-writeback",
          action: "lims.writeback",
          description: "发起演示 LIMS 回写"
        }
      ]
    }
  ]
};

export const demoAuditEvent: AuditEvent = {
  id: "demo-audit-001",
  actorUserId: demoUser.id,
  action: "recognition.reviewed",
  targetType: "recognition-result",
  targetId: demoRecognitionResult.id,
  occurredAt: "2026-06-04T08:12:00.000Z",
  metadata: {
    synthetic: true,
    reviewedFieldCount: 3,
    containsSensitivePayload: false
  }
};

export const demoFeedbackSubmission: FeedbackSubmission = {
  id: "demo-feedback-001",
  recognitionResultId: demoRecognitionResult.id,
  submittedByUserId: demoUser.id,
  fieldKey: "sample_type",
  originalValue: "外周血",
  correctedValue: "外周血",
  reason: "演示反馈：确认模型候选值与合成真值一致。",
  submittedAt: "2026-06-04T08:13:00.000Z"
};

export const demoRuleCandidate: RuleCandidate = {
  id: "demo-rule-candidate-001",
  schemaKey: "tumor-gene-test",
  fieldKey: "sample_type",
  ruleType: "rule",
  proposal: {
    type: "rule",
    fieldKey: "sample_type",
    condition: '当 OCR 块包含"样本类型：外周血"时',
    expectedValue: "外周血",
    evidenceCount: 3
  },
  evidence: [
    { runId: "demo-eval-run-001", sampleId: "demo-eval-sample-001", fieldKey: "sample_type" }
  ],
  status: "proposed",
  proposalHash: "demo-hash-001",
  createdAt: "2026-06-04T08:14:00.000Z",
  decidedAt: null
};

export const demoLimsWritebackRequest: LimsWritebackRequest = {
  id: "demo-lims-writeback-request-001",
  recognitionResultId: demoRecognitionResult.id,
  limsSampleId: "DEMO-SAMPLE-A",
  requestedByUserId: demoUser.id,
  requestedAt: "2026-06-04T08:15:00.000Z",
  fields: [
    {
      sourceFieldKey: "sample_type",
      targetFieldKey: "lims_sample_type",
      value: "外周血"
    },
    {
      sourceFieldKey: "clinical_summary",
      targetFieldKey: "lims_clinical_summary",
      value: "合成病例用于演示结构化识别，不对应任何真实个人。"
    }
  ]
};

export const demoLimsWritebackResult: LimsWritebackResult = {
  id: "demo-lims-writeback-result-001",
  requestId: demoLimsWritebackRequest.id,
  status: "success",
  externalReceiptId: "DEMO-RECEIPT-A",
  completedAt: "2026-06-04T08:16:00.000Z"
};

export const demoEvaluationDataset: EvaluationDataset = {
  id: "demo-eval-dataset-001",
  name: "合成病历识别评测集",
  schemaVersionId: demoFieldSchema.version.id,
  createdAt: "2026-06-04T08:20:00.000Z",
  samples: [
    {
      id: "demo-eval-sample-001",
      documentId: demoOcrDocument.id,
      provenance: "synthetic",
      groundTruth: [
        { fieldKey: "patient_alias", value: "DEMO-PATIENT-A" },
        { fieldKey: "sample_type", value: "外周血" },
        { fieldKey: "clinical_summary", value: "合成病例用于演示结构化识别，不对应任何真实个人。" }
      ]
    }
  ]
};

export const demoEvaluationMetric: EvaluationMetric = {
  name: "field_accuracy",
  value: 1,
  fieldKey: "sample_type"
};

export const demoEvaluationRun: EvaluationRun = {
  id: "demo-eval-run-001",
  datasetId: demoEvaluationDataset.id,
  providerConfigId: demoProviderConfig.id,
  status: "completed",
  metrics: [
    { name: "exact_match", value: 1 },
    demoEvaluationMetric,
    { name: "f1", value: 1 }
  ],
  startedAt: "2026-06-04T08:21:00.000Z",
  completedAt: "2026-06-04T08:22:00.000Z"
};
