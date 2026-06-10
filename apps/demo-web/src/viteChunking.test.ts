import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("demo-web Vite chunking", () => {
  it("aliases the Arco barrel import to a local on-demand entry", () => {
    const config = read("apps/demo-web/vite.config.ts");
    const app = read("apps/demo-web/src/App.tsx");

    expect(config).toContain("arcoOnDemandEntry");
    expect(config).toContain("find: /^@arco-design\\/web-react$/");
    expect(config).toContain("apps/demo-web/src/vendor/arco-on-demand.ts");
    expect(app).not.toMatch(/from\s+["']@arco-design\/web-react["']/);
  });

  it("keeps Arco in one vendor chunk to avoid Rollup circular manual chunk warnings", () => {
    const config = read("apps/demo-web/vite.config.ts");

    expect(config).toContain('return "vendor-arco"');
    expect(config).toContain('return "vendor-react"');
    expect(config).toContain('return "vendor-app-runtime"');
    expect(config).toContain("id.includes(\"@arco-design/web-react\")");
    expect(config).not.toContain("vendor-arco-table");
    expect(config).not.toContain("vendor-arco-form");
    expect(config).not.toContain("vendor-arco-overlay");
    expect(config).not.toContain("vendor-arco-input");
    expect(config).not.toContain("vendor-arco-runtime");
    expect(config).not.toContain("vendor-arco-base");
  });

  it("does not hide bundle regressions by raising the Vite chunk warning limit", () => {
    const config = read("apps/demo-web/vite.config.ts");

    expect(config).not.toContain("chunkSizeWarningLimit");
  });

  it("production build stays under the default Vite chunk warning without circular manual chunk warnings", () => {
    const result = spawnSync("corepack", ["pnpm", "--filter", "@medical-record-agent/demo-web", "build"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).not.toContain("Some chunks are larger than 500 kB");
    expect(output).not.toMatch(/circular (?:dependency|manual chunk)/i);
    expect(output).not.toMatch(/Generated an empty chunk/i);
  });
});
