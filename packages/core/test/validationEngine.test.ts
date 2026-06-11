import { describe, expect, it } from "vitest";
import { getRequiredFieldKeys } from "../src/engine/validationEngine";

describe("getRequiredFieldKeys", () => {
  it("返回标记为 required 的字段", () => {
    const schema = {
      key: "test",
      fields: [
        { key: "diagnosis", label: "诊断", type: "string" as const, required: true },
        { key: "name", label: "姓名", type: "string" as const }
      ]
    };
    expect(getRequiredFieldKeys(schema)).toEqual(["diagnosis"]);
  });

  it("返回标记为 critical 的字段", () => {
    const schema = {
      key: "test",
      fields: [
        { key: "diagnosis", label: "诊断", type: "string" as const, critical: true },
        { key: "name", label: "姓名", type: "string" as const }
      ]
    };
    expect(getRequiredFieldKeys(schema)).toEqual(["diagnosis"]);
  });

  it("无 required/critical 时返回所有字段 key", () => {
    const schema = {
      key: "test",
      fields: [
        { key: "diagnosis", label: "诊断", type: "string" as const },
        { key: "name", label: "姓名", type: "string" as const }
      ]
    };
    expect(getRequiredFieldKeys(schema)).toEqual(["diagnosis", "name"]);
  });

  it("空 schema 返回空数组", () => {
    const schema = { key: "test", fields: [] };
    expect(getRequiredFieldKeys(schema)).toEqual([]);
  });
});
