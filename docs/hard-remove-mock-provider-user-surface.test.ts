import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const userVisibleFiles = [
  "README.md",
  "docs/evaluation-datasets.md",
  "medical-ui/src/layout/AppLayout.tsx",
  "medical-ui/src/pages/NewRecognitionPage.tsx",
  "medical-ui/src/pages/ProviderPage.tsx",
  "medical-ui/src/pages/EvaluationPage.tsx"
];

const forbiddenMainlineTerms = [
  "Mock Provider Ready",
  "Mock OCR Provider",
  "Mock Model Provider",
  "development_placeholder",
  "开发占位 provider",
  "开发占位",
  "mock-ocr",
  "mock-model"
];

describe("hard remove mock provider user surface", () => {
  it("README、用户页面和数据集主线不包含 mock/development placeholder provider 文案", () => {
    const surfaces = userVisibleFiles.map((file) => ({
      file,
      text: readFileSync(file, "utf8")
    }));

    for (const term of forbiddenMainlineTerms) {
      const offenders = surfaces.filter((surface) => surface.text.includes(term)).map((surface) => surface.file);
      expect(offenders, `${term} should not appear in user/business mainline`).toEqual([]);
    }
  });
});
