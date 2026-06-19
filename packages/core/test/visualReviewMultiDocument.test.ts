import { describe, expect, it, vi } from "vitest";

import {
  createDefaultMedicalKnowledgeBase,
  createInMemoryJobRepository,
  createInMemoryKnowledgeRetriever,
  createJobOrchestrator,
  createMockModelProvider,
  createMockOcrProvider,
  limsClinicalInfoSchema,
  type ModelFieldCandidate,
  type ModelProvider,
  type OcrProvider
} from "../src/index";

// 视觉审查节点会以含 image 的请求调用 modelProvider.extractFields。
// 抽取节点则调用不含 image 的请求。本测试通过捕获这两类调用，验证
// P0-1：多文档视觉审查不再被跳过，且多图以 images[] 形式传给 provider。

function candidate(): ModelFieldCandidate {
  return {
    fieldKey: "clinicalDiagnosis",
    value: "DEMO_DIAGNOSIS_A",
    rawValue: "诊断：DEMO_DIAGNOSIS_A",
    confidence: 0.94,
    evidence: [{ snippet: "诊断：DEMO_DIAGNOSIS_A", startOffset: 10, endOffset: 31, pageNumber: 1 }]
  };
}

function createOcrProvider(): OcrProvider {
  return createMockOcrProvider({
    blocks: [
      {
        page: 1,
        blockId: "demo-block-1",
        text: "诊断：DEMO_DIAGNOSIS_A；样本类型：组织。",
        confidence: 0.98,
        coordinates: { x: 0, y: 0, width: 100, height: 20 }
      }
    ]
  });
}

/**
 * 创建一个捕获 extractFields 调用的 modelProvider，记录所有带图片的请求。
 * 抽取节点调用时无图；视觉审查节点调用时带 imageBase64 或 images。
 */
function createCapturingProvider(candidates: ModelFieldCandidate[]): {
  provider: ModelProvider;
  imageRequests: { imageBase64?: string; images?: string[] }[];
} {
  const base = createMockModelProvider({ candidates });
  const imageRequests: { imageBase64?: string; images?: string[] }[] = [];
  const originalExtract = base.extractFields.bind(base);

  base.extractFields = vi.fn(async (request) => {
    if (request.imageBase64 || (request.images && request.images.length > 0)) {
      imageRequests.push({
        ...(request.imageBase64 ? { imageBase64: request.imageBase64 } : {}),
        ...(request.images ? { images: request.images } : {})
      });
    }
    return originalExtract(request);
  });

  return { provider: base, imageRequests };
}

describe("多文档视觉审查（P0-1）", () => {
  it("多文档场景：视觉审查不再被跳过，多图以 images[] 传给 provider", async () => {
    const { provider: modelProvider, imageRequests } = createCapturingProvider([candidate()]);
    const orchestrator = createJobOrchestrator({
      repository: createInMemoryJobRepository(),
      schema: limsClinicalInfoSchema,
      ocrProvider: createOcrProvider(),
      modelProvider,
      knowledgeRetriever: createInMemoryKnowledgeRetriever(createDefaultMedicalKnowledgeBase()),
      permissions: [],
      autoWritebackEnabled: false
    });

    const result = await orchestrator.start({
      jobId: "demo-job-multidoc-visual",
      document: { documentId: "fallback", fileName: "fallback.png", mimeType: "image/png" },
      documents: [
        // 携带图片字节，确保视觉审查能拿到图片
        { documentId: "doc-1", fileName: "page1.png", mimeType: "image/png", content: new Uint8Array([1, 2, 3]) },
        { documentId: "doc-2", fileName: "page2.png", mimeType: "image/png", content: new Uint8Array([4, 5, 6]) },
        { documentId: "doc-3", fileName: "page3.png", mimeType: "image/png", content: new Uint8Array([7, 8, 9]) }
      ]
    });

    // 视觉审查应被触发（至少 1 次带图请求）
    expect(imageRequests.length).toBeGreaterThanOrEqual(1);
    // 多文档应走 images[] 路径，且图片数 = 文档数
    const visualRequest = imageRequests[imageRequests.length - 1];
    expect(visualRequest.images).toBeDefined();
    expect(visualRequest.images).toHaveLength(3);
    // 不应再出现"多文档模式暂不支持视觉评审"的跳过 trace
    expect(result.trace.some((e) => e.node === "visualReview" && e.status === "skipped" && e.message.includes("多文档模式暂不支持"))).toBe(false);
    // 视觉审查应 completed 或 degraded（而非 skipped）
    expect(result.trace.some((e) => e.node === "visualReview" && (e.status === "completed" || e.status === "degraded"))).toBe(true);
  });

  it("单文档场景：仍走 imageBase64 单图路径", async () => {
    const { provider: modelProvider, imageRequests } = createCapturingProvider([candidate()]);
    const orchestrator = createJobOrchestrator({
      repository: createInMemoryJobRepository(),
      schema: limsClinicalInfoSchema,
      ocrProvider: createOcrProvider(),
      modelProvider,
      knowledgeRetriever: createInMemoryKnowledgeRetriever(createDefaultMedicalKnowledgeBase()),
      permissions: [],
      autoWritebackEnabled: false
    });

    await orchestrator.start({
      jobId: "demo-job-singledoc-visual",
      document: { documentId: "doc-single", fileName: "single.png", mimeType: "image/png", content: new Uint8Array([1, 2, 3]) }
    });

    expect(imageRequests.length).toBeGreaterThanOrEqual(1);
    const visualRequest = imageRequests[imageRequests.length - 1];
    // 单文档走 imageBase64，不应有 images
    expect(visualRequest.imageBase64).toBeDefined();
    expect(visualRequest.images).toBeUndefined();
  });

  it("无图片内容时仍正确跳过视觉审查", async () => {
    const { provider: modelProvider, imageRequests } = createCapturingProvider([candidate()]);
    const orchestrator = createJobOrchestrator({
      repository: createInMemoryJobRepository(),
      schema: limsClinicalInfoSchema,
      ocrProvider: createOcrProvider(),
      modelProvider,
      knowledgeRetriever: createInMemoryKnowledgeRetriever(createDefaultMedicalKnowledgeBase()),
      permissions: [],
      autoWritebackEnabled: false
    });

    const result = await orchestrator.start({
      jobId: "demo-job-noimage",
      document: { documentId: "doc-noimg", fileName: "noimg.png", mimeType: "image/png" }
    });

    // 无图不应触发带图请求
    expect(imageRequests).toHaveLength(0);
    expect(result.trace.some((e) => e.node === "visualReview" && e.status === "skipped")).toBe(true);
  });
});
