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

  it("enables visual review and RAG by default for image documents", () => {
    const node = createSupervisorNode();
    const decision = node.decide({
      schema: limsClinicalInfoSchema,
      hasImage: true
    });

    expect(decision.enableVisualReview).toBe(true);
    expect(decision.enableRAG).toBe(true);
    expect(decision.maxRetryRounds).toBe(2);
  });

  it("simplifies RAG and retries when schema has fewer than 5 fields", () => {
    const smallSchema: CoreSchemaDraft = {
      ...limsClinicalInfoSchema,
      fields: limsClinicalInfoSchema.fields.slice(0, 3)
    };
    const node = createSupervisorNode();
    const decision = node.decide({
      schema: smallSchema,
      hasImage: true
    });

    expect(decision.enableRAG).toBe(false);
    expect(decision.maxRetryRounds).toBe(1);
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
});
