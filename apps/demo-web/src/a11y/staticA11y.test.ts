import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("static accessibility guardrails", () => {
  it("AppShell exposes skip navigation, a main landmark target, and labelled global search", () => {
    const shell = read("apps/demo-web/src/layouts/AppShell.tsx");

    expect(shell).toContain('href="#main-content"');
    expect(shell).toContain('id="main-content"');
    expect(shell).toContain('aria-label="全局页面搜索"');
  });

  it("shared medical tables require accessible names", () => {
    const table = read("apps/demo-web/src/components/MedicalDataTable.tsx");

    expect(table).toContain("ariaLabel");
    expect(table).toContain('aria-label={ariaLabel}');
  });
});
