import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("App route loading", () => {
  it("uses route-level lazy loading with an accessible loading state", () => {
    const app = read("apps/demo-web/src/App.tsx");

    expect(app).toContain("lazy(");
    expect(app).toContain("Suspense");
    expect(app).toContain('role="status"');
    expect(app).toContain('aria-live="polite"');
    expect(app).not.toMatch(/import LoginPage from "\.\/pages\/auth\/LoginPage"/);
    expect(app).not.toMatch(/import RecognitionDashboardPage from "\.\/pages\/recognition\/RecognitionDashboardPage"/);
  });

  it("keeps the runtime smoke critical routes registered in the SPA router", () => {
    const app = read("apps/demo-web/src/App.tsx");

    expect(app).toContain('path: "/login"');
    expect(app).toContain("{ index: true, element: <RecognitionDashboardPage /> }");
    expect(app).toContain('path: "recognition/new"');
    expect(app).toContain('path: "recognition/jobs/:jobId"');
    expect(app).toContain('path: "providers"');
    expect(app).toContain('path: "writeback"');
  });
});
