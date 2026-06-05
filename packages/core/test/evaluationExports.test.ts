import { describe, expect, it } from "vitest";

import { calculateFieldMetrics, runEvaluation } from "../src";

describe("evaluation exports", () => {
  it("从 core 根入口导出评估指标和评估运行器", () => {
    expect(calculateFieldMetrics).toBeTypeOf("function");
    expect(runEvaluation).toBeTypeOf("function");
  });
});
