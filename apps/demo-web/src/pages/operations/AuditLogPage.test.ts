import { describe, expect, it } from "vitest";

import { buildAuditCsv } from "./AuditLogPage";

describe("buildAuditCsv", () => {
  it("把当前审计记录转换成可下载 CSV 内容并转义逗号和引号", () => {
    const csv = buildAuditCsv([
      {
        id: "AUD-1",
        time: "2026-06-08 12:00:00",
        actor: "ops-admin",
        action: "provider.updated",
        target: "LLM, OpenAI",
        risk: "medium",
        ip: "127.0.0.1",
        detail: { note: "配置\"已保存\"" }
      }
    ]);

    expect(csv).toContain("id,time,actor,action,target,risk,ip,detail");
    expect(csv).toContain('"LLM, OpenAI"');
    expect(csv).toContain('配置\\""已保存\\""');
  });
});
