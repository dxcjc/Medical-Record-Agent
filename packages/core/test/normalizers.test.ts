import { describe, expect, it } from "vitest";

import {
  normalizeBooleanHistory,
  normalizeDateText,
  normalizeListField,
  normalizeSmokingHistory
} from "../src/index";

describe("clinical normalizers", () => {
  it("normalizes smoking text while preserving original text", () => {
    const result = normalizeSmokingHistory("吸烟20年，每天约10支，已戒烟3年");

    expect(result).toMatchObject({
      originalText: "吸烟20年，每天约10支，已戒烟3年",
      normalizedValue: {
        status: "former",
        years: 20,
        cigarettesPerDay: 10,
        quitYears: 3
      }
    });
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("normalizes boolean history without replacing the original wording", () => {
    const result = normalizeBooleanHistory("否认高血压病史");

    expect(result.originalText).toBe("否认高血压病史");
    expect(result.normalizedValue).toBe(false);
    expect(result.notes).toContain("否认");
  });

  it("normalizes Chinese date text to ISO date and keeps original text", () => {
    const result = normalizeDateText("2026年6月4日入院");

    expect(result).toMatchObject({
      originalText: "2026年6月4日入院",
      normalizedValue: "2026-06-04"
    });
  });

  it("rejects impossible date text with low confidence and original text preserved", () => {
    const monthOverflow = normalizeDateText("2026年13月40日");
    const invalidLeapLikeDate = normalizeDateText("2026年2月31日");

    expect(monthOverflow).toMatchObject({
      originalText: "2026年13月40日",
      normalizedValue: null
    });
    expect(monthOverflow.confidence).toBeLessThan(0.5);
    expect(monthOverflow.notes.join(" ")).toContain("非法日期");

    expect(invalidLeapLikeDate).toMatchObject({
      originalText: "2026年2月31日",
      normalizedValue: null
    });
    expect(invalidLeapLikeDate.confidence).toBeLessThan(0.5);
    expect(invalidLeapLikeDate.notes.join(" ")).toContain("非法日期");
  });

  it("normalizes list fields from common separators and keeps original text", () => {
    const result = normalizeListField("肺癌、胃癌；肝癌");

    expect(result).toMatchObject({
      originalText: "肺癌、胃癌；肝癌",
      normalizedValue: ["肺癌", "胃癌", "肝癌"]
    });
  });

  it("does not let a loose negative word override later positive disease history", () => {
    const result = normalizeBooleanHistory("无明显不适，既往高血压病史");

    expect(result.originalText).toBe("无明显不适，既往高血压病史");
    expect(result.normalizedValue).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(result.notes.join(" ")).toContain("肯定");
  });

  it("returns low-confidence null for empty or unknown boolean history text", () => {
    const emptyResult = normalizeBooleanHistory("");
    const unknownResult = normalizeBooleanHistory("患者一般情况可");

    expect(emptyResult).toMatchObject({
      originalText: "",
      normalizedValue: null
    });
    expect(emptyResult.confidence).toBeLessThan(0.5);

    expect(unknownResult).toMatchObject({
      originalText: "患者一般情况可",
      normalizedValue: null
    });
    expect(unknownResult.confidence).toBeLessThan(0.5);
  });

  it("keeps smoking conflict text low confidence instead of classifying it as never", () => {
    const result = normalizeSmokingHistory("否认戒烟，吸烟20年");

    expect(result.originalText).toBe("否认戒烟，吸烟20年");
    expect(result.normalizedValue.status).not.toBe("never");
    expect(result.normalizedValue.years).toBe(20);
    expect(result.confidence).toBeLessThan(0.7);
    expect(result.notes.join(" ")).toContain("冲突");
  });

  it("returns low-confidence unknown smoking status for empty text", () => {
    const result = normalizeSmokingHistory("");

    expect(result).toMatchObject({
      originalText: "",
      normalizedValue: {
        status: "unknown"
      }
    });
    expect(result.confidence).toBeLessThan(0.5);
  });
});
