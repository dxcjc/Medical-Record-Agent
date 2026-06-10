import { describe, expect, it } from "vitest";

import {
  canPublishSchema,
  describeSchemaActionRecovery,
  isConfirmedSchemaDangerAction,
  parseSchemaValidationResults,
  resolveSchemaDangerActionRequest
} from "./SchemaStudioPage";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { schemaRecords } from "./components/schemaStudioData";

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

  it("发布动作先进入危险操作确认，不允许点击发布时直接调用发布 API", () => {
    expect(resolveSchemaDangerActionRequest("publish")).toEqual({
      pendingAction: "publish",
      shouldCallPublishApi: false
    });
    expect(isConfirmedSchemaDangerAction("publish")).toBe(true);
  });

  it("发布按钮只打开确认弹窗，真实 publishSchemaDraft 只在确认回调中出现", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
    const source = readFileSync(join(root, "apps/demo-web/src/pages/schema/SchemaStudioPage.tsx"), "utf8");

    expect(source).toContain('onPublish={() => setPendingDangerAction("publish")}');
    expect(source).toContain('open={pendingDangerAction === "publish"}');
    expect(source).toContain("onConfirm={handlePublishDraft}");
    expect(source).not.toContain("onPublish={handlePublishDraft}");
  });

  it("Schema 演示数据明确包含危险操作影响范围，供二次确认文案展示", () => {
    expect(schemaRecords[0]?.affectedPipelines.length).toBeGreaterThan(0);
    expect(schemaRecords[0]?.deactivationRisk).toBe("高");
  });

  it("Schema 异步操作状态提供生产变更恢复和重试提示", () => {
    expect(describeSchemaActionRecovery("validate", { isRunning: true, message: "", error: "" })).toEqual({
      tone: "info",
      title: "Schema 验证中",
      message: "正在调用真实 validateDraft API，发布按钮保持受控。",
      canRetry: false
    });

    expect(describeSchemaActionRecovery("publish", { isRunning: false, message: "", error: "SCHEMA_DRAFT_NOT_FOUND" })).toEqual({
      tone: "warning",
      title: "Schema 发布失败",
      message: "SCHEMA_DRAFT_NOT_FOUND。请刷新 Schema 列表、重新验证草稿后再确认发布。",
      canRetry: true
    });

    expect(describeSchemaActionRecovery("rollback", { isRunning: false, message: "已提交 v3.4 的真实回滚请求。", error: "" })).toEqual({
      tone: "success",
      title: "Schema 回滚已提交",
      message: "已提交 v3.4 的真实回滚请求。",
      canRetry: false
    });
  });
});
