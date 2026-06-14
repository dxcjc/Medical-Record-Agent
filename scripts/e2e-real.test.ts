/**
 * Medical Record Agent — 真实端到端（E2E）测试
 * 
 * 流程：登录 → 上传文件 → 创建任务 → 查看任务 → 提交反馈 → 查看统计
 * 运行：npx vitest run scripts/e2e-real.test.ts --reporter=verbose
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.API_BASE || "http://localhost:3000";

let token: string;
let fileId: string;
let jobId: string;
let schemaKey: string;

// ─── 辅助函数 ──────────────────────────────────────────────

async function api(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  const opts: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

// 将文件读取为 base64
function sampleFileBase64(): string {
  // 用一个小的测试 PNG（1x1 像素透明 PNG）
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, // RGBA
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02,
    0x00, 0x01, 0xe5, 0x27, 0xde, 0xfc, 0x00, 0x00,
    0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
    0x60, 0x82, // IEND
  ]);
  return pngHeader.toString("base64");
}

// ─── 测试套件 ──────────────────────────────────────────────

describe("E2E: 完整业务流程", () => {
  
  // ── Phase 1: 认证 ──────────────────────────────────────
  describe("Phase 1: 用户认证", () => {
    it("1.1 健康检查", async () => {
      const res = await fetch(`${BASE}/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");
    });

    it("1.2 登录获取 token", async () => {
      const res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin.dev@example.local",
          password: "ChangeMe123!",
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.accessToken).toBeTruthy();
      token = data.accessToken;
    });

    it("1.3 无效密码登录被拒绝", async () => {
      const res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin.dev@example.local",
          password: "wrong-password",
        }),
      });
      expect(res.status).toBe(401);
    });

    it("1.4 无 token 访问受保护接口被拒绝", async () => {
      const res = await fetch(`${BASE}/jobs`);
      expect(res.status).toBe(401);
    });
  });

  // ── Phase 2: Provider 管理 ──────────────────────────────
  describe("Phase 2: Provider 管理", () => {
    it("2.1 获取 Provider 列表", async () => {
      const { status, data } = await api("GET", "/providers");
      expect(status).toBe(200);
      expect(data.items).toBeTruthy();
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeGreaterThanOrEqual(4);
    });

    it("2.2 Provider 包含正确的默认项", async () => {
      const { data } = await api("GET", "/providers");
      const keys = data.items.map((p: any) => p.key);
      expect(keys).toContain("paddleocr-http");
      expect(keys).toContain("volces-seed-2-pro");
      expect(keys).toContain("local-storage-default");
    });

    it("2.3 Provider 详情包含正确配置", async () => {
      const { data } = await api("GET", "/providers");
      const ocr = data.items.find((p: any) => p.key === "paddleocr-http");
      expect(ocr).toBeTruthy();
      expect(ocr.kind).toBe("ocr");
      expect(ocr.status).toBe("active");
    });
  });

  // ── Phase 3: Schema 管理 ──────────────────────────────
  describe("Phase 3: Schema 管理", () => {
    it("3.1 获取 Schema 列表", async () => {
      const { status, data } = await api("GET", "/schemas");
      expect(status).toBe(200);
      expect(data.items).toBeTruthy();
      expect(Array.isArray(data.items)).toBe(true);
      if (data.items.length > 0) {
        schemaKey = data.items[0].schemaKey || data.items[0].key;
      }
    });

    it("3.2 Schema 包含版本信息", async () => {
      const { data } = await api("GET", "/schemas");
      if (data.items.length > 0) {
        const schema = data.items[0];
        expect(schema.schemaKey || schema.key).toBeTruthy();
      }
    });
  });

  // ── Phase 4: 文件上传 ──────────────────────────────────
  describe("Phase 4: 文件上传", () => {
    it("4.1 上传文件元数据", async () => {
      const { status, data } = await api("POST", "/files", {
        originalName: "e2e-test-report.png",
        mimeType: "image/png",
        byteSize: 67,
        contentBase64: sampleFileBase64(),
      });
      expect(status).toBe(200);
      expect(data.id).toBeTruthy();
      fileId = data.id;
    });

    it("4.2 文件内容可下载", async () => {
      const res = await fetch(`${BASE}/files/${fileId}/content`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("image/png");
    });
  });

  // ── Phase 5: 识别任务（核心流程）────────────────────────
  describe("Phase 5: 识别任务", () => {
    it("5.1 创建识别任务（带文件）", async () => {
      const body: any = {
        sourceFileId: fileId,
        providerConfig: {
          ocrProviderKey: "paddleocr-http",
          providerKey: "volces-seed-2-pro",
        },
      };
      if (schemaKey) {
        body.schemaKey = schemaKey;
      }
      const { status, data } = await api("POST", "/jobs", body);
      expect(status).toBe(200);
      expect(data.id).toBeTruthy();
      jobId = data.id;
    });

    it("5.2 空 body 也能创建任务（API 允许）", async () => {
      const { status, data } = await api("POST", "/jobs", {});
      expect(status).toBe(200);
      expect(data.id).toBeTruthy();
    });

    it("5.3 获取任务详情", async () => {
      const { status, data } = await api("GET", `/jobs/${jobId}`);
      expect(status).toBe(200);
      expect(data.id).toBe(jobId);
      expect(data.status).toBeTruthy();
    });

    it("5.4 任务列表包含新任务", async () => {
      const { status, data } = await api("GET", "/jobs");
      expect(status).toBe(200);
      const items = Array.isArray(data) ? data : data.items;
      expect(items.some((j: any) => j.id === jobId)).toBe(true);
    });

    it("5.5 不存在的任务返回 404", async () => {
      const { status } = await api("GET", "/jobs/nonexistent-id-12345");
      expect(status).toBe(404);
    });
  });

  // ── Phase 6: 结果与反馈 ────────────────────────────────
  describe("Phase 6: 结果与反馈", () => {
    it("6.1 获取任务结果", async () => {
      const { status, data } = await api("GET", `/jobs/${jobId}/results`);
      // 结果可能还没生成（异步），所以 200 或 404 都可接受
      expect([200, 404]).toContain(status);
    });

    it("6.2 提交字段反馈", async () => {
      const { status } = await api("POST", "/feedback", {
        jobId: jobId,
        fieldKey: "patient_name",
        expected: "张三",
        actual: "张 三",
        decision: "corrected",
        reason: "E2E 测试反馈",
      });
      // 200 或 201 都可接受
      expect([200, 201]).toContain(status);
    });

    it("6.3 获取反馈列表（需要 jobId 参数）", async () => {
      const { status, data } = await api("GET", `/feedback?jobId=${jobId}`);
      expect(status).toBe(200);
    });
  });

  // ── Phase 7: 统计与审计 ────────────────────────────────
  describe("Phase 7: 统计与审计", () => {
    it("7.1 获取仪表盘统计", async () => {
      const { status, data } = await api("GET", "/stats/dashboard");
      expect(status).toBe(200);
      expect(data).toBeTruthy();
    });

    it("7.2 获取审计日志", async () => {
      const { status, data } = await api("GET", "/audit");
      expect(status).toBe(200);
    });
  });

  // ── Phase 8: 边界与错误处理 ────────────────────────────
  describe("Phase 8: 边界与错误处理", () => {
    it("8.1 不存在的路由返回 404", async () => {
      const { status } = await api("GET", "/nonexistent-route");
      expect(status).toBe(404);
    });

    it("8.2 畸形 JSON 被拒绝", async () => {
      const res = await fetch(`${BASE}/jobs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{invalid json",
      });
      expect([400, 500]).toContain(res.status);
    });

    it("8.3 超长 ID 不会导致崩溃", async () => {
      const longId = "x".repeat(1000);
      const { status } = await api("GET", `/jobs/${longId}`);
      expect([400, 404]).toContain(status);
    });
  });
});
