import { describe, expect, it } from "vitest";

import {
  canPublishSchema,
  parseSchemaValidationResults
} from "./SchemaStudioPage";

describe("SchemaStudioPage 真实 API 映射", () => {
  it("把后端 validateDraft 响应映射成验证结果卡片", () => {
    expect(
      parseSchemaValidationResults({
        validation: {
          valid: false,
          errors: [
            {
              code: "INVALID_MIN_CONFIDENCE",
              path: "evidencePolicy.minConfidence",
              message: "minConfidence 必须在 0 到 1 之间"
            }
          ]
        }
      })
    ).toEqual([
      {
        id: "INVALID_MIN_CONFIDENCE",
        level: "error",
        title: "INVALID_MIN_CONFIDENCE",
        target: "evidencePolicy.minConfidence",
        detail: "minConfidence 必须在 0 到 1 之间"
      }
    ]);
  });

  it("校验通过时显示来自真实接口的通过结果", () => {
    expect(
      parseSchemaValidationResults({
        validation: {
          valid: true,
          errors: []
        }
      })
    ).toEqual([
      {
        id: "schema-validation-pass",
        level: "success",
        title: "Schema 校验通过",
        target: "真实 Schema API",
        detail: "后端 validateDraft 返回 valid=true，当前草稿满足发布前基础校验。"
      }
    ]);
  });

  it("发布权限由真实登录权限决定，不再依赖页面本地管理员开关", () => {
    expect(canPublishSchema((permission) => permission === "schema:publish")).toBe(true);
    expect(canPublishSchema(() => false)).toBe(false);
  });
});
