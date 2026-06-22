import { describe, expect, it, vi } from "vitest";

import { createVisualReviewNode } from "../src/nodes/visualReviewNode";
import { limsClinicalInfoSchema } from "../src/schemas/limsClinicalInfoSchema";

import type { ModelFieldCandidate, ModelProvider } from "../src/providers/providerTypes";

// 任务1：视觉审查阶段超时接线。
// VisualReviewConfig.timeoutMs 此前是死配置(从未被读取)。
// 本测试验证：超时后 run() 抛出超时错误,供 workflow 的 catch 块走降级路径。

function candidate(): ModelFieldCandidate {
  return {
    fieldKey: "clinicalDiagnosis",
    value: "DEMO_DIAGNOSIS_A",
    rawValue: "诊断：DEMO_DIAGNOSIS_A",
    confidence: 0.9,
    evidence: [{ snippet: "x", startOffset: 0, endOffset: 1, pageNumber: 1 }]
  };
}

/** 创建一个永不 resolve 的 provider,模拟视觉模型挂起。 */
function createHangingProvider(): ModelProvider {
  return {
    providerName: "hanging-provider",
    async extractFields() {
      // 永不返回,模拟 LLM 挂起
      return new Promise(() => {});
    }
  };
}

/** 创建一个延迟 resolve 的 provider,模拟慢但能完成的视觉模型。 */
function createSlowProvider(delayMs: number, candidates: ModelFieldCandidate[]): ModelProvider {
  return {
    providerName: "slow-provider",
    async extractFields() {
      await new Promise((r) => setTimeout(r, delayMs));
      return {
        providerName: "slow-provider",
        candidates,
        raw: { providerMode: "http" }
      };
    }
  };
}

describe("视觉审查阶段超时（任务1）", () => {
  it("超时后 run() 抛出错误(供 workflow 降级)", async () => {
    const node = createVisualReviewNode({
      provider: createHangingProvider(),
      config: { timeoutMs: 100 } // 100ms 超时
    });

    await expect(
      node.run({
        schema: limsClinicalInfoSchema,
        ocrText: "诊断：DEMO_DIAGNOSIS_A",
        imageBase64: "fake-base64"
      })
    ).rejects.toThrow();
  });

  it("未超时时正常返回结果", async () => {
    const node = createVisualReviewNode({
      provider: createSlowProvider(20, [candidate()]),
      config: { timeoutMs: 500 } // 500ms 超时,provider 20ms 完成
    });

    const result = await node.run({
      schema: limsClinicalInfoSchema,
      ocrText: "诊断：DEMO_DIAGNOSIS_A",
      imageBase64: "fake-base64"
    });

    expect(result.providerName).toBe("slow-provider");
  });

  it("未配置 timeoutMs 时使用默认 90000ms", async () => {
    // 不传 config,验证默认超时不立即触发(provider 20ms 完成)
    const node = createVisualReviewNode({
      provider: createSlowProvider(20, [candidate()])
    });

    const result = await node.run({
      schema: limsClinicalInfoSchema,
      ocrText: "诊断：DEMO_DIAGNOSIS_A",
      imageBase64: "fake-base64"
    });

    expect(result.providerName).toBe("slow-provider");
  });

  it("超时错误信息包含超时毫秒数,便于 trace 记录", async () => {
    const node = createVisualReviewNode({
      provider: createHangingProvider(),
      config: { timeoutMs: 150 }
    });

    try {
      await node.run({
        schema: limsClinicalInfoSchema,
        ocrText: "诊断：DEMO_DIAGNOSIS_A",
        imageBase64: "fake-base64"
      });
      expect.fail("应抛出超时错误");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const msg = (error as Error).message;
      expect(msg).toContain("150");
    }
  });
});
