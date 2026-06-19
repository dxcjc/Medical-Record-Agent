import { describe, expect, it } from "vitest";

import { detectOcrGaps } from "../src/engine/workflowShared";
import {
  createDefaultMedicalKnowledgeBase,
  createInMemoryJobRepository,
  createInMemoryKnowledgeRetriever,
  createJobOrchestrator,
  createMockModelProvider,
  createMockOcrProvider,
  limsClinicalInfoSchema,
  type ModelFieldCandidate,
  type OcrProvider
} from "../src/index";

import type { CoreSchemaDraft } from "../src/schemas/schemaValidator";

// P0-2：OCR 关键区域空文本检测。当 OCR 漏掉关键诊断文字（如"病理诊断："后无内容）时，
// detectOcrGaps 应识别出该 gap，供 workflow 强制触发视觉审查兜底。

function schemaWithCriticalRegion(fieldKey: string, criticalRegion: string): CoreSchemaDraft {
  return {
    ...limsClinicalInfoSchema,
    fields: limsClinicalInfoSchema.fields.map((f) =>
      f.key === fieldKey ? { ...f, criticalRegion } : f
    )
  };
}

describe("detectOcrGaps（P0-2 OCR 漏识兜底）", () => {
  it("OCR 含关键区域关键词但其后无实质内容时，识别出 gap", () => {
    // 典型场景：OCR 只识别到"病理诊断："，后面的诊断文字完全丢失
    const schema = schemaWithCriticalRegion("clinicalDiagnosis", "病理诊断");
    const gaps = detectOcrGaps("患者姓名：张三\n病理诊断：\n样本类型：组织", schema);

    expect(gaps).toHaveLength(1);
    expect(gaps[0].fieldKey).toBe("clinicalDiagnosis");
    expect(gaps[0].reason).toContain("病理诊断");
  });

  it("OCR 关键区域后有实质内容时，不报告 gap", () => {
    const schema = schemaWithCriticalRegion("clinicalDiagnosis", "病理诊断");
    const gaps = detectOcrGaps("病理诊断：膀胱高级别尿路上皮癌\n样本类型：组织", schema);

    expect(gaps).toEqual([]);
  });

  it("OCR 文本中完全不含关键区域关键词时，不报告 gap", () => {
    const schema = schemaWithCriticalRegion("clinicalDiagnosis", "病理诊断");
    const gaps = detectOcrGaps("患者姓名：张三\n样本类型：组织", schema);

    expect(gaps).toEqual([]);
  });

  it("字段未标注 criticalRegion 时，按内置默认关键词表检测", () => {
    // clinicalDiagnosis 未标注 criticalRegion，但默认关键词表含"病理诊断"/"诊断意见"
    const gaps = detectOcrGaps("病理诊断：\n样本类型：组织", limsClinicalInfoSchema);

    expect(gaps.length).toBeGreaterThanOrEqual(1);
    expect(gaps.some((g) => g.fieldKey === "clinicalDiagnosis")).toBe(true);
  });

  it("关键区域关键词后只有少量空白或标点时，仍判定为 gap", () => {
    const schema = schemaWithCriticalRegion("clinicalDiagnosis", "诊断意见");
    // 关键词后只有冒号和空白，无实质内容
    const gaps = detectOcrGaps("诊断意见：   \n样本类型：组织", schema);

    expect(gaps).toHaveLength(1);
  });

  it("多个字段标注了 criticalRegion 且都漏识时，全部报告", () => {
    const schema: CoreSchemaDraft = {
      ...limsClinicalInfoSchema,
      fields: [
        { ...limsClinicalInfoSchema.fields[0], key: "fieldA", criticalRegion: "病理诊断" },
        { ...limsClinicalInfoSchema.fields[1], key: "fieldB", criticalRegion: "诊断意见" }
      ]
    };
    const gaps = detectOcrGaps("病理诊断：\n诊断意见：\n", schema);

    expect(gaps).toHaveLength(2);
    expect(gaps.map((g) => g.fieldKey).sort()).toEqual(["fieldA", "fieldB"]);
  });
});

// ── P0-2 集成：workflow 中 gap 兜底强制触发视觉审查 ──

describe("OCR gap 兜底触发视觉审查（P0-2 集成）", () => {
  it("有图且 OCR 关键区域漏识时，视觉审查被触发并记录 gap 信息", async () => {
    // 构造 OCR 文本：临床诊断关键词后内容缺失（漏识）
    const gapOcrProvider: OcrProvider = createMockOcrProvider({
      blocks: [
        {
          page: 1,
          blockId: "gap-block",
          text: "患者姓名：张三\n病理诊断：\n样本类型：组织",
          confidence: 0.95,
          coordinates: { x: 0, y: 0, width: 100, height: 20 }
        }
      ]
    });

    const candidate: ModelFieldCandidate = {
      fieldKey: "clinicalDiagnosis",
      value: "DEMO_DIAGNOSIS_A",
      rawValue: "诊断：DEMO_DIAGNOSIS_A",
      confidence: 0.9,
      evidence: [{ snippet: "x", startOffset: 0, endOffset: 1, pageNumber: 1 }]
    };

    const orchestrator = createJobOrchestrator({
      repository: createInMemoryJobRepository(),
      schema: limsClinicalInfoSchema,
      ocrProvider: gapOcrProvider,
      modelProvider: createMockModelProvider({ candidates: [candidate] }),
      knowledgeRetriever: createInMemoryKnowledgeRetriever(createDefaultMedicalKnowledgeBase()),
      permissions: [],
      autoWritebackEnabled: false
    });

    const result = await orchestrator.start({
      jobId: "demo-job-gap-fallback",
      // 携带图片，确保视觉审查能拿到图（supervisor 因有图会开启视觉审查）
      document: { documentId: "doc-gap", fileName: "gap.png", mimeType: "image/png", content: new Uint8Array([1, 2, 3]) }
    });

    // 视觉审查应被触发（completed 或 degraded），不应是 skipped
    const visualEvents = result.trace.filter((e) => e.node === "visualReview");
    expect(visualEvents.some((e) => e.status === "completed" || e.status === "degraded")).toBe(true);
    expect(visualEvents.some((e) => e.status === "skipped")).toBe(false);
  });

  it("无图且 OCR 关键区域漏识时，gap 检测覆盖 supervisor 关闭决策，视觉审查尝试执行后因无图 skip", async () => {
    // 无图场景：supervisor 会关闭视觉审查（!hasImage）。
    // P0-2 的 gap 检测应覆盖该关闭决策，使视觉审查进入执行入口而非被 supervisor 直接跳过。
    // 因无图，最终会因"无图片内容"skip —— 但 skip 原因应是"无图片内容"而非"Supervisor 决策跳过"。
    const gapOcrProvider: OcrProvider = createMockOcrProvider({
      blocks: [
        {
          page: 1,
          blockId: "gap-block-noimg",
          text: "病理诊断：\n样本类型：组织",
          confidence: 0.95,
          coordinates: { x: 0, y: 0, width: 100, height: 20 }
        }
      ]
    });

    const candidate: ModelFieldCandidate = {
      fieldKey: "clinicalDiagnosis",
      value: "DEMO_DIAGNOSIS_A",
      rawValue: "诊断：DEMO_DIAGNOSIS_A",
      confidence: 0.9,
      evidence: [{ snippet: "x", startOffset: 0, endOffset: 1, pageNumber: 1 }]
    };

    const orchestrator = createJobOrchestrator({
      repository: createInMemoryJobRepository(),
      schema: limsClinicalInfoSchema,
      ocrProvider: gapOcrProvider,
      modelProvider: createMockModelProvider({ candidates: [candidate] }),
      knowledgeRetriever: createInMemoryKnowledgeRetriever(createDefaultMedicalKnowledgeBase()),
      permissions: [],
      autoWritebackEnabled: false
    });

    const result = await orchestrator.start({
      jobId: "demo-job-gap-noimg",
      // 无 content，supervisor 判定无图 → 关闭视觉审查
      document: { documentId: "doc-noimg-gap", fileName: "noimg.png", mimeType: "image/png" }
    });

    const visualEvents = result.trace.filter((e) => e.node === "visualReview");
    // gap 检测覆盖了 supervisor 关闭：skip 原因应是"无图片内容"而非"Supervisor 决策跳过"
    expect(visualEvents.some((e) => e.status === "skipped")).toBe(true);
    expect(visualEvents.some((e) => e.message.includes("Supervisor 决策跳过"))).toBe(false);
    expect(visualEvents.some((e) => e.message.includes("无图片内容"))).toBe(true);
  });
});
