import { describe, expect, it } from "vitest";

import {
  chooseServedAppReadinessExitCode,
  extractViteJavaScriptBundleAssets,
  formatServedAppReadinessSummary,
  runServedAppReadiness
} from "./served-app-readiness";

function htmlWithBundles(...assets: string[]) {
  return [
    '<div id="root"></div>',
    ...assets.map((asset, index) =>
      index === 0
        ? `<script type="module" src="${asset}"></script>`
        : `<link rel="modulepreload" href="${asset}">`
    )
  ].join("\n");
}

describe("served app readiness script", () => {
  it("extracts Vite JavaScript bundle assets from served or dist HTML", () => {
    const html = `
      <link rel="stylesheet" href="/assets/index.css">
      <link rel="modulepreload" href="/assets/vendor-react-A1.js">
      <script type="module" src="/assets/index-B2.js"></script>
      <script src="/src/main.tsx"></script>
    `;

    expect(extractViteJavaScriptBundleAssets(html)).toEqual([
      "/assets/index-B2.js",
      "/assets/vendor-react-A1.js"
    ]);
  });

  it("passes local served artifact readiness when 9901 home, health and dist bundles match", async () => {
    const servedHtml = htmlWithBundles("/assets/index-CURRENT.js", "/assets/vendor-react-CURRENT.js");
    const fetchImpl = async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/api/health")) {
        return new Response(
          JSON.stringify({
            status: "ok",
            service: "medical-record-agent-api"
          }),
          { status: 200 }
        );
      }

      return new Response(servedHtml, {
        status: 200,
        headers: {
          "content-type": "text/html"
        }
      });
    };

    const summary = await runServedAppReadiness({
      now: () => new Date("2026-06-10T01:00:00.000Z"),
      fetchImpl,
      readFile: async () => servedHtml
    });

    expect(summary.localReadiness).toBe("passed");
    expect(summary.externalIntegration).toBe("not-evaluated");
    expect(summary.finalProduct).toBe("not-evaluated");
    expect(summary.servedBundles).toEqual(["/assets/index-CURRENT.js", "/assets/vendor-react-CURRENT.js"]);
    expect(summary.distBundles).toEqual(["/assets/index-CURRENT.js", "/assets/vendor-react-CURRENT.js"]);
    expect(summary.matchedBundles).toEqual(["/assets/index-CURRENT.js", "/assets/vendor-react-CURRENT.js"]);
    expect(chooseServedAppReadinessExitCode(summary)).toBe(0);
    expect(formatServedAppReadinessSummary(summary)).toContain("localReadiness=passed");
    expect(formatServedAppReadinessSummary(summary)).toContain("servedBundle=/assets/index-CURRENT.js,/assets/vendor-react-CURRENT.js");
    expect(formatServedAppReadinessSummary(summary)).toContain("finalProduct=not-evaluated");
  });

  it("returns blocked with exit code 2 when the 9901 served app is not reachable", async () => {
    const summary = await runServedAppReadiness({
      now: () => new Date("2026-06-10T01:00:00.000Z"),
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED 127.0.0.1:9901");
      },
      readFile: async () => htmlWithBundles("/assets/index-CURRENT.js")
    });

    expect(summary.localReadiness).toBe("blocked");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "served-home",
          status: "blocked",
          code: "SERVED_APP_HOME_UNREACHABLE"
        }),
        expect.objectContaining({
          id: "api-health",
          status: "blocked",
          code: "SERVED_APP_API_HEALTH_UNREACHABLE"
        })
      ])
    );
    expect(chooseServedAppReadinessExitCode(summary)).toBe(2);
    expect(formatServedAppReadinessSummary(summary)).toContain("BLOCKED_DETAIL served-app served-home SERVED_APP_HOME_UNREACHABLE");
  });

  it("fails when the served 9901 bundle does not match apps/demo-web/dist/index.html", async () => {
    const summary = await runServedAppReadiness({
      now: () => new Date("2026-06-10T01:00:00.000Z"),
      fetchImpl: async (input: URL | RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/api/health")) {
          return new Response(
            JSON.stringify({
              status: "ok",
              service: "medical-record-agent-api"
            }),
            { status: 200 }
          );
        }

        return new Response(htmlWithBundles("/assets/index-OLD.js"), { status: 200 });
      },
      readFile: async () => htmlWithBundles("/assets/index-NEW.js")
    });

    expect(summary.localReadiness).toBe("failed");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "bundle-consistency",
          status: "failed",
          code: "SERVED_APP_BUNDLE_MISMATCH"
        })
      ])
    );
    expect(chooseServedAppReadinessExitCode(summary)).toBe(1);
    expect(formatServedAppReadinessSummary(summary)).toContain("FAILED bundle-consistency SERVED_APP_BUNDLE_MISMATCH");
  });

  it("fails when /api/health is reachable but no longer returns the expected API contract", async () => {
    const html = htmlWithBundles("/assets/index-CURRENT.js");
    const summary = await runServedAppReadiness({
      now: () => new Date("2026-06-10T01:00:00.000Z"),
      fetchImpl: async (input: URL | RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/api/health")) {
          return new Response(JSON.stringify({ status: "ok", service: "wrong-service" }), { status: 200 });
        }

        return new Response(html, { status: 200 });
      },
      readFile: async () => html
    });

    expect(summary.localReadiness).toBe("failed");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "api-health",
          status: "failed",
          code: "SERVED_APP_API_HEALTH_INVALID"
        })
      ])
    );
    expect(chooseServedAppReadinessExitCode(summary)).toBe(1);
  });
});
