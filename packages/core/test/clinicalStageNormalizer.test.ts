import { describe, expect, it } from "vitest";

import { normalizeClinicalStage } from "../src/normalizers/clinicalStageNormalizer";

// P1-5：clinicalStage 格式标准化。
// Agent 可能输出 TNM 分期（如"ypT1cN1Mx"）或临床分期（如"IV期"）。
// 规则：报告中有临床分期优先输出临床分期；无则输出 TNM；去除 yp 前缀（新辅助治疗后）。

describe("normalizeClinicalStage（P1-5 分期格式标准化）", () => {
  it("去除 yp 前缀（新辅助治疗后分期）", () => {
    const result = normalizeClinicalStage("ypT1cN1Mx");
    expect(result.normalizedValue).toBe("T1cN1Mx");
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it("去除 y 前缀（新辅助治疗后）", () => {
    const result = normalizeClinicalStage("yT2N0M0");
    expect(result.normalizedValue).toBe("T2N0M0");
  });

  it("纯 TNM 分期保持不变", () => {
    const result = normalizeClinicalStage("T1N1Mx");
    expect(result.normalizedValue).toBe("T1N1Mx");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("临床分期（罗马数字+期）保持不变", () => {
    const result = normalizeClinicalStage("IV期");
    expect(result.normalizedValue).toBe("IV期");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("临床分期（中文数字+期）保持不变", () => {
    const result = normalizeClinicalStage("三期");
    expect(result.normalizedValue).toBe("三期");
  });

  it("带'期'和TNM同时存在时，优先保留临床分期", () => {
    // 形如 "IV期（T3N1M0）" → 优先临床分期 "IV期"
    const result = normalizeClinicalStage("IV期（T3N1M0）");
    expect(result.normalizedValue).toBe("IV期");
    expect(result.notes.some((n) => n.includes("优先临床分期"))).toBe(true);
  });

  it("空字符串返回空值并标注", () => {
    const result = normalizeClinicalStage("");
    expect(result.normalizedValue).toBe("");
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it("无法识别的格式保留原值并低置信度", () => {
    const result = normalizeClinicalStage("不清楚");
    expect(result.normalizedValue).toBe("不清楚");
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("去除 yp 前缀并保留临床分期优先", () => {
    // "ypT1cN1Mx" 有 yp 前缀，应去除得到 "T1cN1Mx"
    // 这是纯 TNM（无临床分期），所以保留 TNM
    const result = normalizeClinicalStage("ypT1cN1Mx");
    expect(result.normalizedValue).toBe("T1cN1Mx");
  });

  it("小写 tnm 也识别并标准化为大写", () => {
    const result = normalizeClinicalStage("t1n1mx");
    expect(result.normalizedValue).toBe("T1N1Mx");
  });
});
