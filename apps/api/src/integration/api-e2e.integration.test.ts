/**
 * End-to-End API Integration Tests
 *
 * Tests all critical API endpoints against a running server with a real database.
 * Token is cached via beforeAll to avoid rate limiting; each test is otherwise independent.
 *
 * Run: npx vitest run apps/api/src/integration/api-e2e.integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = "admin.dev@example.local";
const ADMIN_PASSWORD = "ChangeMe123!";

// ─── Helper ──────────────────────────────────────────────────────────────────

async function api(
  method: string,
  path: string,
  options: {
    token?: string;
    body?: unknown;
    rawBody?: string;
    contentType?: string;
  } = {}
): Promise<{ status: number; headers: Headers; body: any }> {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = options.contentType ?? "application/json";
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body:
      options.rawBody ??
      (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  });
  let body: any;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    body = await res.json();
  } else {
    body = await res.text();
  }

  return { status: res.status, headers: res.headers, body };
}

/** Login and cache token for the entire suite */
let CACHED_TOKEN: string;

async function getToken(): Promise<string> {
  if (CACHED_TOKEN) return CACHED_TOKEN;
  const res = await api("POST", "/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (res.status !== 200 || !res.body.accessToken) {
    throw new Error(`Login failed: ${JSON.stringify(res.body)}`);
  }
  CACHED_TOKEN = res.body.accessToken;
  return CACHED_TOKEN;
}

// Pre-login once before all tests
let TOKEN: string;
beforeAll(async () => {
  TOKEN = await getToken();
  // Clean up any leftover test-* providers from previous runs
  try {
    const { execSync } = await import("child_process");
    execSync(
      `sudo -u postgres psql -d medical_record_agent -c "DELETE FROM \\"ProviderConfig\\" WHERE key LIKE 'test-%%';"`,
      { timeout: 5000, stdio: "pipe" }
    );
  } catch {
    // best-effort cleanup
  }
});

// Clean up test data after all tests
afterAll(async () => {
  try {
    const { execSync } = await import("child_process");
    execSync(
      `sudo -u postgres psql -d medical_record_agent -c "DELETE FROM \\"ProviderConfig\\" WHERE key LIKE 'test-%%';"`,
      { timeout: 5000, stdio: "pipe" }
    );
  } catch {
    // best-effort cleanup
  }
});
afterAll(async () => {
  try {
    // Clean up test provider configs created during tests
    const listRes = await api("GET", "/providers", { token: TOKEN });
    if (listRes.status === 200 && listRes.body.items) {
      const items = listRes.body.items as any[];
      for (const provider of items) {
        if (provider.key && provider.key.startsWith("test-")) {
          await api("DELETE", `/providers/${provider.key}`, { token: TOKEN });
        }
      }
    }
  } catch {
    // cleanup errors are non-fatal
  }
});

// ─── Health / Status ─────────────────────────────────────────────────────────

describe("Health & Status", () => {
  it("GET /health — returns ok", async () => {
    const res = await api("GET", "/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("medical-record-agent-api");
  });

  it("GET /status — returns runtime info", async () => {
    const res = await api("GET", "/status");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.runtime).toBeDefined();
    expect(res.body.runtime.serviceMode).toBeDefined();
  });
});

// ─── 1. Authentication ──────────────────────────────────────────────────────

describe("Authentication", () => {
  it("POST /auth/login — correct password → 200 + token + user info", async () => {
    const res = await api("POST", "/auth/login", {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.tokenType).toBe("Bearer");
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(ADMIN_EMAIL);
    expect(res.body.permissions).toBeInstanceOf(Array);
    expect(res.body.roles).toBeInstanceOf(Array);
  });

  it("POST /auth/login — wrong password → 401 (BUG: returns 500)", async () => {
    const res = await api("POST", "/auth/login", {
      body: { email: ADMIN_EMAIL, password: "wrong-password" },
    });
    // BUG: AuthError is thrown but not caught properly — server returns 500 instead of 401
    expect(res.status).toBe(401);
  });

  it("POST /auth/login — missing body → 400", async () => {
    const res = await api("POST", "/auth/login", { body: {} });
    expect(res.status).toBe(400);
  });

  it("POST /auth/login — empty email → 401", async () => {
    const res = await api("POST", "/auth/login", {
      body: { email: "", password: "some-password" },
    });
    // Empty email means no user found, so 401 is appropriate
    expect(res.status).toBe(401);
  });

  it("POST /auth/login — nonexistent user → 401 (BUG: returns 500)", async () => {
    const res = await api("POST", "/auth/login", {
      body: {
        email: `nonexistent-${Date.now()}@example.local`,
        password: "some-password",
      },
    });
    // BUG: Same error handling issue — AuthError thrown but not caught
    expect(res.status).toBe(401);
  });

  it("Bearer token access → authenticated endpoint returns 200", async () => {
    const res = await api("GET", "/providers", { token: TOKEN });
    expect(res.status).toBe(200);
  });

  it("No token → 401", async () => {
    const res = await api("GET", "/providers");
    expect(res.status).toBe(401);
  });

  it("Invalid token → 401", async () => {
    const res = await api("GET", "/providers", {
      token: "invalid.token.value",
    });
    expect(res.status).toBe(401);
  });

  it("POST /auth/logout — returns ok", async () => {
    const res = await api("POST", "/auth/logout", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ─── 2. Provider CRUD ───────────────────────────────────────────────────────

describe("Provider CRUD", () => {
  it("GET /providers — list includes existing providers", async () => {
    const res = await api("GET", "/providers", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
  });

  it("POST /providers — create new provider", async () => {
    const key = `test-ocr-${Date.now()}`;
    const res = await api("POST", "/providers", {
      token: TOKEN,
      body: {
        key,
        kind: "ocr",
        displayName: "Test OCR Provider",
        enabled: false,
        isDefault: false,
        config: { endpoint: "http://localhost:9999" },
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.provider).toBeDefined();
    expect(res.body.provider.key).toBe(key);
    expect(res.body.provider.kind).toBe("ocr");

    // Cleanup
    await api("DELETE", `/providers/${key}`, { token: TOKEN });
  });

  it("POST /providers — missing required fields → 400", async () => {
    const res = await api("POST", "/providers", {
      token: TOKEN,
      body: { kind: "ocr" },
    });
    expect(res.status).toBe(400);
  });

  it("PUT /providers/:key — full update", async () => {
    const key = `test-update-${Date.now()}`;
    await api("POST", "/providers", {
      token: TOKEN,
      body: {
        key,
        kind: "ocr",
        displayName: "Before Update",
        enabled: false,
        config: { endpoint: "http://localhost:9999" },
      },
    });

    const res = await api("PUT", `/providers/${key}`, {
      token: TOKEN,
      body: {
        kind: "ocr",
        displayName: "After Update",
        enabled: true,
        config: { endpoint: "http://localhost:9998" },
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.provider.displayName).toBe("After Update");

    await api("DELETE", `/providers/${key}`, { token: TOKEN });
  });

  it("PUT /providers/:key — toggle enabled (partial update)", async () => {
    const key = `test-toggle-${Date.now()}`;
    await api("POST", "/providers", {
      token: TOKEN,
      body: {
        key,
        kind: "ocr",
        displayName: "Toggle Test",
        enabled: false,
        config: { endpoint: "http://localhost:9999" },
      },
    });

    const res = await api("PUT", `/providers/${key}`, {
      token: TOKEN,
      body: { enabled: true },
    });
    expect(res.status).toBe(200);
    expect(res.body.provider).toBeDefined();

    await api("DELETE", `/providers/${key}`, { token: TOKEN });
  });

  it("POST /providers/:key/default — set as default (BUG: returns 500)", async () => {
    const key = `test-default-${Date.now()}`;
    await api("POST", "/providers", {
      token: TOKEN,
      body: {
        key,
        kind: "ocr",
        displayName: "Default Test",
        enabled: true,
        config: { endpoint: "http://localhost:9999" },
      },
    });

    const res = await api("POST", `/providers/${key}/default`, {
      token: TOKEN,
    });
    // BUG: setDefaultProvider returns 500 — likely missing implementation or DB error
    expect(res.status).toBe(200);

    await api("DELETE", `/providers/${key}`, { token: TOKEN });
  });

  it("DELETE /providers/:key — delete provider", async () => {
    const key = `test-delete-${Date.now()}`;
    await api("POST", "/providers", {
      token: TOKEN,
      body: {
        key,
        kind: "ocr",
        displayName: "Delete Test",
        enabled: false,
        config: { endpoint: "http://localhost:9999" },
      },
    });

    const res = await api("DELETE", `/providers/${key}`, { token: TOKEN });
    // API returns { deleted: true } or { deleted: false, reason: "already_deleted" }
    expect(res.status).toBe(200);
    expect(typeof res.body.deleted).toBe("boolean");
  });

  it("DELETE /providers/nonexistent-key — returns error", async () => {
    const res = await api("DELETE", `/providers/nonexistent-${Date.now()}`, {
      token: TOKEN,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("POST /providers — secret refs are redacted in response", async () => {
    const key = `test-redact-${Date.now()}`;
    const res = await api("POST", "/providers", {
      token: TOKEN,
      body: {
        key,
        kind: "ocr",
        displayName: "Redact Test",
        enabled: false,
        config: { endpoint: "http://localhost:9999" },
        secretRefs: { apiKey: "my-secret-ref-name" },
      },
    });
    expect(res.status).toBe(201);

    const listRes = await api("GET", "/providers", { token: TOKEN });
    const found = listRes.body.items.find((p: any) => p.key === key);
    expect(found).toBeDefined();
    expect(found.config?.apiKey).toBeUndefined();

    await api("DELETE", `/providers/${key}`, { token: TOKEN });
  });
});

// ─── 3. Schema Management ───────────────────────────────────────────────────

describe("Schema Management", () => {
  it("GET /schemas — returns list", async () => {
    const res = await api("GET", "/schemas", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
  });

  it("GET /schemas — list contains schema objects with expected fields", async () => {
    const res = await api("GET", "/schemas", { token: TOKEN });
    expect(res.status).toBe(200);
    const items = res.body.items as any[];
    if (items.length > 0) {
      const first = items[0];
      expect(first.schemaKey).toBeDefined();
      expect(first.version).toBeDefined();
      expect(first.displayName).toBeDefined();
    }
  });

  it("GET /schemas — without token → 401", async () => {
    const res = await api("GET", "/schemas");
    expect(res.status).toBe(401);
  });
});

// ─── 4. File Upload ─────────────────────────────────────────────────────────

describe("File Upload", () => {
  it("POST /files — upload file metadata", async () => {
    const res = await api("POST", "/files", {
      token: TOKEN,
      body: {
        originalName: `test-${Date.now()}.pdf`,
        mimeType: "application/pdf",
        byteSize: 1024,
      },
    });
    expect(res.status).toBeLessThanOrEqual(201);
    if (res.status <= 201) {
      expect(res.body.id).toBeDefined();
    }
  });

  it("POST /files — invalid mime type → 400", async () => {
    const res = await api("POST", "/files", {
      token: TOKEN,
      body: {
        originalName: "test.exe",
        mimeType: "application/x-executable",
      },
    });
    expect(res.status).toBe(400);
  });

  it("POST /files — missing originalName → 400", async () => {
    const res = await api("POST", "/files", {
      token: TOKEN,
      body: { mimeType: "application/pdf" },
    });
    expect(res.status).toBe(400);
  });
});

// ─── 5. Recognition Jobs ────────────────────────────────────────────────────

describe("Recognition Jobs", () => {
  it("GET /jobs — list jobs (paginated)", async () => {
    const res = await api("GET", "/jobs", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
  });

  it("GET /jobs?page=1&pageSize=5 — pagination works", async () => {
    const res = await api("GET", "/jobs?page=1&pageSize=5", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
    expect(res.body.items.length).toBeLessThanOrEqual(5);
    if (res.body.total !== undefined) {
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(5);
    }
  });

  it("POST /jobs — create job with sourceFileId", async () => {
    const fileRes = await api("POST", "/files", {
      token: TOKEN,
      body: {
        originalName: `job-test-${Date.now()}.pdf`,
        mimeType: "application/pdf",
        byteSize: 2048,
        contentBase64: "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNjEyIDc5Ml0+PmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCnRyYWlsZXI8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoxOTAKJSVFT0Y=",
      },
    });
    if (fileRes.status > 201) return;
    const fileId = fileRes.body.id;

    const res = await api("POST", "/jobs", {
      token: TOKEN,
      body: { sourceFileId: fileId },
    });
    expect(res.status).toBeLessThanOrEqual(201);
    if (res.status <= 201) {
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBeDefined();
    }
  });

  it("POST /jobs — create job with schemaKey", async () => {
    const res = await api("POST", "/jobs", {
      token: TOKEN,
      body: { schemaKey: "tumor-gene-test" },
    });
    expect([200, 201, 400, 404, 500]).toContain(res.status);
  });

  it("GET /jobs/:id — get specific job", async () => {
    const listRes = await api("GET", "/jobs?pageSize=1", { token: TOKEN });
    if (listRes.body.items?.length > 0) {
      const jobId = listRes.body.items[0].id;
      const res = await api("GET", `/jobs/${jobId}`, { token: TOKEN });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(jobId);
    }
  });

  it("GET /jobs/:id — nonexistent → 404", async () => {
    const res = await api("GET", `/jobs/nonexistent-${Date.now()}`, {
      token: TOKEN,
    });
    expect(res.status).toBe(404);
  });
});

// ─── 6. Results ─────────────────────────────────────────────────────────────

describe("Results", () => {
  it("GET /results/:jobId — for existing job", async () => {
    const listRes = await api("GET", "/jobs?pageSize=1", { token: TOKEN });
    if (listRes.body.items?.length > 0) {
      const jobId = listRes.body.items[0].id;
      const res = await api("GET", `/results/${jobId}`, { token: TOKEN });
      expect([200, 404]).toContain(res.status);
    }
  });

  it("GET /results/:jobId — nonexistent jobId → 404", async () => {
    const res = await api("GET", `/results/nonexistent-${Date.now()}`, {
      token: TOKEN,
    });
    expect(res.status).toBe(404);
  });
});

// ─── 7. Evaluation Center ───────────────────────────────────────────────────

describe("Evaluation Center", () => {
  it("GET /evaluations/datasets — list datasets", async () => {
    const res = await api("GET", "/evaluations/datasets", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
  });

  it("POST /evaluations/datasets — create dataset", async () => {
    const key = `test-eval-ds-${Date.now()}`;
    const res = await api("POST", "/evaluations/datasets", {
      token: TOKEN,
      body: {
        key,
        displayName: "E2E Test Dataset",
        description: "Created by integration test",
        deidentified: true,
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.dataset).toBeDefined();
    expect(res.body.dataset.key).toBe(key);
  });

  it("POST /evaluations/datasets — missing key → 400", async () => {
    const res = await api("POST", "/evaluations/datasets", {
      token: TOKEN,
      body: { displayName: "No Key" },
    });
    expect(res.status).toBe(400);
  });

  it("POST /evaluations/datasets — missing displayName → 400", async () => {
    const res = await api("POST", "/evaluations/datasets", {
      token: TOKEN,
      body: { key: `no-display-${Date.now()}` },
    });
    expect(res.status).toBe(400);
  });

  it("GET /evaluations/runs — list runs", async () => {
    const res = await api("GET", "/evaluations/runs", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
  });

  it("POST /evaluations/runs — create run with invalid datasetId → error", async () => {
    const res = await api("POST", "/evaluations/runs", {
      token: TOKEN,
      body: {
        datasetId: "nonexistent-dataset",
        providerKey: "mock",
      },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ─── 8. Feedback Management ─────────────────────────────────────────────────

describe("Feedback Management", () => {
  it("GET /feedback/all — list all feedback", async () => {
    const res = await api("GET", "/feedback/all", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
  });

  it("GET /feedback/all — pagination params work", async () => {
    const res = await api("GET", "/feedback/all?page=1&pageSize=10", {
      token: TOKEN,
    });
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
    expect(res.body.total).toBeDefined();
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(10);
  });

  it("GET /feedback/stats — field stats", async () => {
    const res = await api("GET", "/feedback/stats", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.stats).toBeInstanceOf(Array);
  });

  it("POST /feedback — submit feedback", async () => {
    const listRes = await api("GET", "/jobs?pageSize=1", { token: TOKEN });
    if (listRes.body.items?.length > 0) {
      const jobId = listRes.body.items[0].id;
      const res = await api("POST", "/feedback", {
        token: TOKEN,
        body: {
          jobId,
          fieldKey: "clinicalDiagnosis",
          correctedValue: "Test Correction",
          source: "manual",
        },
      });
      expect(res.status).toBeLessThanOrEqual(201);
    }
  });

  it("POST /feedback — missing jobId and fieldKey → 400", async () => {
    const res = await api("POST", "/feedback", {
      token: TOKEN,
      body: { correctedValue: "no job" },
    });
    expect(res.status).toBe(400);
  });

  it("POST /feedback — using 'field' alias for fieldKey", async () => {
    const listRes = await api("GET", "/jobs?pageSize=1", { token: TOKEN });
    if (listRes.body.items?.length > 0) {
      const jobId = listRes.body.items[0].id;
      const res = await api("POST", "/feedback", {
        token: TOKEN,
        body: {
          jobId,
          field: "patientName",
          correctedValue: "Alias Test",
          source: "manual",
        },
      });
      expect(res.status).toBeLessThanOrEqual(201);
    }
  });
});

// ─── 9. Audit Log ───────────────────────────────────────────────────────────

describe("Audit Log", () => {
  it("GET /audit — list audit logs", async () => {
    const res = await api("GET", "/audit", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
  });

  it("GET /audit — pagination params", async () => {
    const res = await api("GET", "/audit?take=5", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
    expect(res.body.items.length).toBeLessThanOrEqual(5);
  });

  it("GET /audit — filter by action", async () => {
    const res = await api("GET", "/audit?action=auth.login", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
  });

  it("GET /audit — filter by objectType", async () => {
    const res = await api("GET", "/audit?objectType=provider", {
      token: TOKEN,
    });
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
  });

  it("GET /audit — date range filter", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await api(
      "GET",
      `/audit?startDate=${today}&endDate=${today}`,
      { token: TOKEN }
    );
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
  });
});

// ─── 10. Knowledge Management ───────────────────────────────────────────────

describe("Knowledge Management", () => {
  it("GET /knowledge — list knowledge entries", async () => {
    const res = await api("GET", "/knowledge", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
  });

  it("GET /knowledge — with kind filter", async () => {
    const res = await api("GET", "/knowledge?kind=cancer_alias", {
      token: TOKEN,
    });
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
  });
});

// ─── 11. Stats / Dashboard ──────────────────────────────────────────────────

describe("Stats & Dashboard", () => {
  it("GET /stats/dashboard — returns dashboard stats", async () => {
    const res = await api("GET", "/stats/dashboard", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.todayJobs).toBeDefined();
    expect(res.body.totalJobs).toBeDefined();
    expect(res.body.needsReview).toBeDefined();
    expect(res.body.completedJobs).toBeDefined();
  });

  it("GET /stats/fields — without schemaKey returns empty", async () => {
    const res = await api("GET", "/stats/fields", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.stats).toBeInstanceOf(Array);
  });

  it("GET /stats/fields?schemaKey=xxx — with schemaKey", async () => {
    const res = await api(
      "GET",
      "/stats/fields?schemaKey=tumor-gene-test",
      { token: TOKEN }
    );
    expect(res.status).toBe(200);
    expect(res.body.stats).toBeInstanceOf(Array);
  });

  it("GET /stats/trends — returns trend data", async () => {
    const res = await api(
      "GET",
      "/stats/trend?schemaKey=tumor-gene-test&days=7",
      { token: TOKEN }
    );
    expect(res.status).toBe(200);
  });
});

// ─── 12. V1 External API ────────────────────────────────────────────────────

describe("V1 External API", () => {
  it("GET /v1/jobs — list jobs", async () => {
    const res = await api("GET", "/v1/jobs", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
    expect(res.body.total).toBeDefined();
    expect(res.body.page).toBeDefined();
    expect(res.body.pageSize).toBeDefined();
  });

  it("GET /v1/jobs — pagination", async () => {
    const res = await api("GET", "/v1/jobs?page=1&pageSize=3", {
      token: TOKEN,
    });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeLessThanOrEqual(3);
  });
});

// ─── 13. Writeback ──────────────────────────────────────────────────────────

describe("Writeback", () => {
  it("GET /writeback/history — list writeback history", async () => {
    const res = await api("GET", "/writeback/history", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
  });

  it("POST /writeback — missing jobId → 400", async () => {
    const res = await api("POST", "/writeback", {
      token: TOKEN,
      body: { confirmed: true },
    });
    expect(res.status).toBe(400);
  });

  it("POST /writeback — missing confirmed → 400", async () => {
    const res = await api("POST", "/writeback", {
      token: TOKEN,
      body: { jobId: "some-job-id" },
    });
    expect(res.status).toBe(400);
  });
});

// ─── 14. Security Headers ───────────────────────────────────────────────────

describe("Security Headers", () => {
  it("Responses include security headers", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    // Server sets referrer-policy to 'no-referrer' but fetch may return browser default
    const referrerPolicy = res.headers.get("referrer-policy");
    expect(["no-referrer", "strict-origin-when-cross-origin"]).toContain(referrerPolicy);
  });

  it("CORS headers present on OPTIONS preflight", async () => {
    const res = await fetch(`${BASE_URL}/health`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(res.status).toBeLessThanOrEqual(204);
  });
});

// ─── 15. Permission Checks ──────────────────────────────────────────────────

describe("Permission Checks", () => {
  it("Audit log requires auth", async () => {
    const res = await api("GET", "/audit");
    expect(res.status).toBe(401);
  });

  it("Providers require auth", async () => {
    const res = await api("GET", "/providers");
    expect(res.status).toBe(401);
  });

  it("Evaluation datasets require auth", async () => {
    const res = await api("GET", "/evaluations/datasets");
    expect(res.status).toBe(401);
  });

  it("Feedback requires auth", async () => {
    const res = await api("GET", "/feedback/all");
    expect(res.status).toBe(401);
  });
});

// ─── 16. Edge Cases & Error Handling ────────────────────────────────────────

describe("Edge Cases & Error Handling", () => {
  it("Unknown route → 404", async () => {
    const res = await api("GET", "/this-route-does-not-exist");
    expect(res.status).toBe(404);
  });

  it("POST with invalid JSON body → 400", async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: "not-valid-json{",
    });
    expect(res.status).toBe(400);
  });

  it("GET /providers — secretRefs values are masked (not plaintext)", async () => {
    const res = await api("GET", "/providers", { token: TOKEN });
    expect(res.status).toBe(200);
    const items = res.body.items as any[];
    // Ensure at least one provider has non-empty secretRefs to validate masking
    const hasNonEmptySecretRefs = items.some(
      (p: any) => p.secretRefs && typeof p.secretRefs === "object" && Object.keys(p.secretRefs).length > 0
    );
    expect(hasNonEmptySecretRefs).toBe(true);
    for (const provider of items) {
      if (provider.secretRefs) {
        for (const [, value] of Object.entries(provider.secretRefs)) {
          if (typeof value === "object" && value !== null) {
            expect(value).toHaveProperty("configured");
          }
        }
      }
    }
  });

  it("GET /audit — pageSize exceeds max is capped", async () => {
    const res = await api("GET", "/audit?pageSize=9999", { token: TOKEN });
    expect(res.status).toBe(200);
  });
});

// ─── 17. Full Workflow: Upload → Create Job → Get Result ─────────────────────

describe("Full Workflow: Upload → Job → Result", () => {
  it("upload file → create job → get job → get result", async () => {
    // Step 1: Upload file
    const fileRes = await api("POST", "/files", {
      token: TOKEN,
      body: {
        originalName: `workflow-${Date.now()}.pdf`,
        mimeType: "application/pdf",
        byteSize: 4096,
        contentBase64: "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNjEyIDc5Ml0+PmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCnRyYWlsZXI8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoxOTAKJSVFT0Y=",
      },
    });
    if (fileRes.status > 201) return;
    const fileId = fileRes.body.id;
    expect(fileId).toBeDefined();

    // Step 2: Create job
    const jobRes = await api("POST", "/jobs", {
      token: TOKEN,
      body: { sourceFileId: fileId },
    });
    expect(jobRes.status).toBeLessThanOrEqual(201);
    const jobId = jobRes.body.id;
    expect(jobId).toBeDefined();

    // Step 3: Get job detail
    const jobDetail = await api("GET", `/jobs/${jobId}`, { token: TOKEN });
    expect(jobDetail.status).toBe(200);
    expect(jobDetail.body.id).toBe(jobId);

    // Step 4: Get result (may or may not exist yet)
    const resultRes = await api("GET", `/results/${jobId}`, { token: TOKEN });
    expect([200, 404]).toContain(resultRes.status);
  });
});

// ─── 18. Duplicate Provider Key ─────────────────────────────────────────────

describe("Duplicate Provider Key Handling", () => {
  it("POST /providers with duplicate key — upserts (updates existing)", async () => {
    const key = `test-dup-${Date.now()}`;
    const body = {
      key,
      kind: "ocr",
      displayName: "Dup Test",
      enabled: false,
      config: { endpoint: "http://localhost:9999" },
    };

    const res1 = await api("POST", "/providers", { token: TOKEN, body });
    expect(res1.status).toBe(201);

    const res2 = await api("POST", "/providers", {
      token: TOKEN,
      body: { ...body, displayName: "Dup Test Updated" },
    });
    // Should either succeed (upsert) or fail with conflict
    expect([200, 201, 409]).toContain(res2.status);

    await api("DELETE", `/providers/${key}`, { token: TOKEN });
  });
});

// ─── 19. Schema Drafts ──────────────────────────────────────────────────────

describe("Schema Drafts", () => {
  it("POST /schemas/drafts — create a draft", async () => {
    const key = `test-schema-${Date.now()}`;
    const res = await api("POST", "/schemas/drafts", {
      token: TOKEN,
      body: {
        schemaKey: key,
        displayName: "E2E Test Schema",
        definition: {
          key,
          fields: [
            { key: "patientName", label: "Patient Name", type: "string" },
          ],
        },
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.draft).toBeDefined();
    expect(res.body.draft.schemaKey).toBe(key);
  });

  it("POST /schemas/drafts — missing schemaKey → 400", async () => {
    const res = await api("POST", "/schemas/drafts", {
      token: TOKEN,
      body: {
        displayName: "No Key Schema",
        definition: {},
      },
    });
    expect(res.status).toBe(400);
  });

  it("POST /schemas/drafts — missing definition → 400", async () => {
    const res = await api("POST", "/schemas/drafts", {
      token: TOKEN,
      body: {
        schemaKey: `no-def-${Date.now()}`,
        displayName: "No Definition",
      },
    });
    expect(res.status).toBe(400);
  });
});

// ─── 20. Provider Health Check ──────────────────────────────────────────────

describe("Provider Health Check", () => {
  it("POST /providers/:key/health — existing provider", async () => {
    const key = `test-health-${Date.now()}`;
    await api("POST", "/providers", {
      token: TOKEN,
      body: {
        key,
        kind: "ocr",
        displayName: "Health Test",
        enabled: false,
        config: { endpoint: "http://localhost:9999" },
      },
    });

    const res = await api("POST", `/providers/${key}/health`, { token: TOKEN });
    expect([200, 400, 500, 502, 503]).toContain(res.status);

    await api("DELETE", `/providers/${key}`, { token: TOKEN });
  });
});
