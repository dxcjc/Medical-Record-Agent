import type { MockModelProviderConfig, ModelProvider } from "./providerTypes";

const defaultCandidates = [
  {
    fieldKey: "clinicalDiagnosis",
    value: "模拟诊断",
    rawValue: "模拟诊断",
    confidence: 0.99,
    evidence: [{ snippet: "模拟诊断", startOffset: 0, endOffset: 4, pageNumber: 1 }]
  }
];

export function createMockModelProvider(config: MockModelProviderConfig = {}): ModelProvider {
  const providerName = config.providerName ?? "mock-model";
  const candidates = config.candidates ?? defaultCandidates;

  return {
    providerName,
    async extractFields() {
      // Mock 模型 provider 是测试和 Demo 的稳定边界：不读取 OCR 原文、不调用真实模型，
      // 只返回配置好的候选字段，方便验证后续验证器、适配器和回写流程。
      return {
        providerName,
        candidates
      };
    }
  };
}
