import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sevenDimensionReports = [
  "MEDICAL-P1-P2-NEXT-LOCAL-ACTIONABILITY-FIX-REPORT.md",
  "MEDICAL-P1-P2-CONTINUED-BUSINESS-SECURITY-FIX-REPORT.md",
  "MEDICAL-P1-P2-CONTINUED-BUSINESS-SECURITY-AUDIT-REPORT.md"
].filter(existsSync);

const requiredDimensions = [
  "产品概述",
  "功能完整性",
  "业务流程完整性",
  "用户体验",
  "技术实现",
  "问题清单",
  "验收结论"
];

describe("P1/P2 business-security report quality", () => {
  it("keeps required handoff and audit reports in the 7-dimension product audit structure", () => {
    for (const reportPath of sevenDimensionReports) {
      const report = readFileSync(reportPath, "utf8");

      for (const dimension of requiredDimensions) {
        expect(report, `${reportPath} should include ${dimension}`).toContain(dimension);
      }

      expect(report, `${reportPath} should not claim final medical product passed without real smoke`).toContain(
        "医疗最终产品"
      );
      expect(report, `${reportPath} should keep real external integration blocked explicit`).toContain(
        "真实外部集成"
      );
      expect(report, `${reportPath} should record exit code 2 blocked semantics`).toContain("exit code 2");
    }
  });
});
