import { describe, expect, expectTypeOf, test } from "vitest";
import {
  demoAuditEvent,
  demoEvaluationDataset,
  demoEvaluationMetric,
  demoEvaluationRun,
  demoFeedbackSubmission,
  demoFieldSchema,
  demoLimsWritebackRequest,
  demoLimsWritebackResult,
  demoOcrDocument,
  demoProviderConfig,
  demoRecognitionJob,
  demoRecognitionResult,
  demoRuleCandidate,
  demoStorageFile,
  demoUser
} from "./fixtures";
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
  StorageMetadata,
  StorageFile,
  User
} from "./types";

describe("shared fixtures", () => {
  test("导出演示 payload 并满足共享类型契约", () => {
    expectTypeOf(demoFieldSchema).toEqualTypeOf<FieldSchema>();
    expectTypeOf(demoOcrDocument).toEqualTypeOf<OcrDocument>();
    expectTypeOf(demoRecognitionJob).toEqualTypeOf<RecognitionJob>();
    expectTypeOf(demoRecognitionResult).toEqualTypeOf<RecognitionResult>();
    expectTypeOf(demoProviderConfig).toEqualTypeOf<ProviderConfig>();
    expectTypeOf(demoUser).toEqualTypeOf<User>();
    expectTypeOf(demoAuditEvent).toEqualTypeOf<AuditEvent>();
    expectTypeOf(demoStorageFile).toEqualTypeOf<StorageFile>();
    expectTypeOf(demoFeedbackSubmission).toEqualTypeOf<FeedbackSubmission>();
    expectTypeOf(demoRuleCandidate).toEqualTypeOf<RuleCandidate>();
    expectTypeOf(demoLimsWritebackRequest).toEqualTypeOf<LimsWritebackRequest>();
    expectTypeOf(demoLimsWritebackResult).toEqualTypeOf<LimsWritebackResult>();
    expectTypeOf(demoEvaluationDataset).toEqualTypeOf<EvaluationDataset>();
    expectTypeOf(demoEvaluationRun).toEqualTypeOf<EvaluationRun>();
    expectTypeOf(demoEvaluationMetric).toEqualTypeOf<EvaluationMetric>();

    expect(demoFieldSchema.version.label).toBe("demo");
    expect(demoOcrDocument.synthetic).toBe(true);
    expect(demoRecognitionJob.status).toBe("completed");
    expect(demoRecognitionResult.fieldCandidates.length).toBeGreaterThan(0);
  });

  test("fixtures 明确标识为 synthetic/demo，且不包含明显真实敏感标识模式", () => {
    const serializedFixtures = JSON.stringify({
      demoAuditEvent,
      demoEvaluationDataset,
      demoEvaluationMetric,
      demoEvaluationRun,
      demoFeedbackSubmission,
      demoFieldSchema,
      demoLimsWritebackRequest,
      demoLimsWritebackResult,
      demoOcrDocument,
      demoProviderConfig,
      demoRecognitionJob,
      demoRecognitionResult,
      demoRuleCandidate,
      demoStorageFile,
      demoUser
    });

    expect(serializedFixtures).toContain("synthetic");
    expect(serializedFixtures).toContain("demo");
    expect(serializedFixtures).not.toMatch(/1[3-9]\d{9}/);
    expect(serializedFixtures).not.toMatch(/\d{17}[\dXx]/);
    expect(serializedFixtures).not.toMatch(/住院号[:：]?\s*\d{6,}/);
    expect(serializedFixtures).not.toMatch(/病历号[:：]?\s*\d{6,}/);
    expect(serializedFixtures).not.toMatch(/张三|李四|王五|赵六/);
  });

  test("共享类型保留内置提示，同时允许机构自定义扩展标识", () => {
    const customStorage: StorageMetadata = {
      provider: "hospital-nas-gateway",
      bucket: "demo-custom-bucket",
      objectKey: "synthetic/custom/demo-file.pdf",
      encrypted: true
    };

    const customProvider: ProviderConfig = {
      ...demoProviderConfig,
      id: "demo-provider-private-model",
      vendor: "hospital-private-llm"
    };

    const customAuditEvent: AuditEvent = {
      ...demoAuditEvent,
      id: "demo-audit-schema-change",
      targetType: "schema-version"
    };

    const customMetric: EvaluationMetric = {
      name: "custom_field_normalization_score",
      value: 0.91
    };

    expect(customStorage.provider).toBe("hospital-nas-gateway");
    expect(customProvider.vendor).toBe("hospital-private-llm");
    expect(customAuditEvent.targetType).toBe("schema-version");
    expect(customMetric.name).toBe("custom_field_normalization_score");
  });
});
