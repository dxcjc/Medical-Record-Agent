import { describe, expect, it } from "vitest";

import { createSupervisorNode } from "../src/index";
import { limsClinicalInfoSchema, type CoreSchemaDraft } from "../src/index";

describe("supervisor node", () => {
  it("disables visual review when document has no image", () => {
    const node = createSupervisorNode();
    const decision = node.decide({
      schema: limsClinicalInfoSchema,
      hasImage: false
    });

    expect(decision.enableVisualReview).toBe(false);
    expect(decision.reasons).toContain("无图片内容，跳过视觉评审");
  });

  it("enables RAG by default for image documents (single mode skips visual review)", () => {
    const node = createSupervisorNode();
    const decision = node.decide({
      schema: limsClinicalInfoSchema,
      hasImage: true
    });

    // 任务3后:单图默认 single 模式,关闭视觉审查和重试以压降耗时
    expect(decision.enableRAG).toBe(true);
    expect(decision.extractionMode).toBe("single");
    expect(decision.enableVisualReview).toBe(false);
    expect(decision.maxRetryRounds).toBe(0);
  });

  it("simplifies RAG when schema has fewer than 5 fields (single mode forces 0 retries)", () => {
    const smallSchema: CoreSchemaDraft = {
      ...limsClinicalInfoSchema,
      fields: limsClinicalInfoSchema.fields.slice(0, 3)
    };
    const node = createSupervisorNode();
    const decision = node.decide({
      schema: smallSchema,
      hasImage: true
    });

    // 字段数少规则关闭 RAG;single 模式进一步把重试设为 0
    expect(decision.enableRAG).toBe(false);
    expect(decision.extractionMode).toBe("single");
    expect(decision.maxRetryRounds).toBe(0);
    expect(decision.reasons).toContain("Schema 字段数少，简化 RAG 和重试");
  });

  it("forces visual review on for table/form documents even without image", () => {
    const node = createSupervisorNode();
    const decision = node.decide({
      schema: limsClinicalInfoSchema,
      documentType: "table",
      hasImage: false
    });

    // 规则1（无图）会先关视觉，规则3（表格）再强制开启
    expect(decision.enableVisualReview).toBe(true);
    expect(decision.reasons).toContain("表格/表单类文档，视觉识别优先");
  });

  it("does not output removed strategy or confidenceThreshold fields", () => {
    const node = createSupervisorNode();
    const decision = node.decide({
      schema: limsClinicalInfoSchema,
      hasImage: true
    });

    // 这些字段已被移除（死输出清理）
    expect((decision as unknown as Record<string, unknown>).strategy).toBeUndefined();
    expect((decision as unknown as Record<string, unknown>).confidenceThreshold).toBeUndefined();
  });

  // ── 任务3：extractionMode 提取模式开关 ──

  it("单文档(默认)采用 single 模式,关闭视觉审查和重试", () => {
    const node = createSupervisorNode();
    const decision = node.decide({
      schema: limsClinicalInfoSchema,
      hasImage: true,
      documentCount: 1
    });

    expect(decision.extractionMode).toBe("single");
    expect(decision.enableVisualReview).toBe(false);
    expect(decision.maxRetryRounds).toBe(0);
  });

  it("多文档(>1)切换 multiSource 模式,启用视觉审查", () => {
    const node = createSupervisorNode();
    const decision = node.decide({
      schema: limsClinicalInfoSchema,
      hasImage: true,
      documentCount: 3
    });

    expect(decision.extractionMode).toBe("multiSource");
    expect(decision.enableVisualReview).toBe(true);
    expect(decision.maxRetryRounds).toBe(2);
  });

  it("未传 documentCount 时按单文档处理(single 模式)", () => {
    const node = createSupervisorNode();
    const decision = node.decide({
      schema: limsClinicalInfoSchema,
      hasImage: true
    });

    expect(decision.extractionMode).toBe("single");
    expect(decision.enableVisualReview).toBe(false);
  });

  it("表格/表单文档即使在 single 模式下也保持视觉审查开启", () => {
    const node = createSupervisorNode();
    const decision = node.decide({
      schema: limsClinicalInfoSchema,
      documentType: "table",
      hasImage: true,
      documentCount: 1
    });

    // 表格强制开启视觉(规则3),不进入 single 的关闭分支
    expect(decision.enableVisualReview).toBe(true);
  });

  it("多文档切换 multiSource 时不被字段数少规则干扰", () => {
    const smallSchema: CoreSchemaDraft = {
      ...limsClinicalInfoSchema,
      fields: limsClinicalInfoSchema.fields.slice(0, 3)
    };
    const node = createSupervisorNode();
    const decision = node.decide({
      schema: smallSchema,
      hasImage: true,
      documentCount: 2
    });

    // 多文档优先:multiSource + 视觉开启(字段数少规则只调 RAG/重试,不影响模式)
    expect(decision.extractionMode).toBe("multiSource");
    expect(decision.enableVisualReview).toBe(true);
  });
});
