import { describe, expect, it } from "vitest";

import { normalizePathologicalDiagnosis } from "../src/normalizers/pathologyNormalizer";

// P1-3：pathologicalDiagnosis 输出过长后处理。
// Agent 常输出完整病理描述（含部位前缀、转移说明），期望简短诊断名。
// normalizePathologicalDiagnosis 提取核心名词短语，降低重抽成本。

describe("normalizePathologicalDiagnosis（P1-3 病理诊断简化）", () => {
  it("去除部位前缀括号，保留核心诊断名", () => {
    const result = normalizePathologicalDiagnosis("（肝脏右前叶）转移性低分化腺癌");
    // 期望去掉部位前缀，保留"转移性低分化腺癌"
    expect(result.normalizedValue).toBe("转移性低分化腺癌");
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it("去除'符合X转移'后缀说明", () => {
    const result = normalizePathologicalDiagnosis("转移性低分化腺癌，符合肠癌肝转移");
    expect(result.normalizedValue).toBe("转移性低分化腺癌");
  });

  it("同时处理部位前缀和转移后缀", () => {
    const result = normalizePathologicalDiagnosis("（肝脏右前叶）转移性低分化腺癌，符合肠癌肝转移");
    expect(result.normalizedValue).toBe("转移性低分化腺癌");
  });

  it("简短诊断名保持不变", () => {
    const result = normalizePathologicalDiagnosis("膀胱高级别尿路上皮癌");
    expect(result.normalizedValue).toBe("膀胱高级别尿路上皮癌");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("空字符串返回空值并标注", () => {
    const result = normalizePathologicalDiagnosis("");
    expect(result.normalizedValue).toBe("");
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it("仅含部位前缀无核心诊断时返回原文本并低置信度", () => {
    const result = normalizePathologicalDiagnosis("（肝脏右前叶）");
    // 无实质核心诊断，保留原文本但低置信度
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("多个部位前缀括号都去除", () => {
    const result = normalizePathologicalDiagnosis("（胃小弯）（贲门）腺癌");
    expect(result.normalizedValue).toBe("腺癌");
  });

  it("去除尾部'，'分隔的附加说明", () => {
    const result = normalizePathologicalDiagnosis("低分化腺癌，部分为印戒细胞癌");
    // 主诊断为"低分化腺癌"，附加说明去除
    expect(result.normalizedValue).toBe("低分化腺癌");
  });
});
